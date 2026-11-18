use crate::model::*;
use scraper::{Html, Selector};
use sha2::{Digest, Sha256};
use url::Url;
const MAX_BYTES: usize = 8 * 1024 * 1024;
pub fn safe_url(input: &str) -> Result<Url, String> {
    let mut u = Url::parse(input).map_err(|_| "请输入完整的 http 或 https 地址。")?;
    if !["http", "https"].contains(&u.scheme())
        || !u.username().is_empty()
        || u.password().is_some()
    {
        return Err("仅支持不含账户密码的 http 或 https 地址。".into());
    }
    u.set_fragment(None);
    Ok(u)
}
pub fn hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
async fn fetch(client: &reqwest::Client, url: &Url) -> Result<(Vec<u8>, Url), String> {
    let mut response = client.get(url.clone()).send().await.map_err(|e| {
        if e.is_timeout() {
            "连接超时，请稍后重试。".to_string()
        } else {
            "无法连接订阅，请检查网络和地址。".into()
        }
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "订阅服务器返回 HTTP {}，缓存内容保持不变。",
            response.status().as_u16()
        ));
    }
    let final_url = safe_url(response.url().as_str())?;
    if response
        .content_length()
        .is_some_and(|n| n > MAX_BYTES as u64)
    {
        return Err("订阅文件超过 8 MB，未导入。".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "订阅下载中断，请重试。")?
    {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err("订阅文件超过 8 MB，未导入。".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok((bytes, final_url))
}
pub fn parse(bytes: &[u8], url: &Url, name: &str, generation: i64) -> Result<PreparedFeed, String> {
    let feed = feed_rs::parser::Builder::new()
        .base_uri(Some(url.as_str()))
        .id_generator(|_, _, _| String::new())
        .sanitize_content(true)
        .build()
        .parse(bytes)
        .map_err(|_| "这个地址没有返回有效的 RSS 或 Atom 订阅。")?;
    let id = format!("feed:{}", hash(url.as_str()));
    let title = if name.trim().is_empty() {
        feed.title
            .map(|t| t.content)
            .unwrap_or_else(|| url.host_str().unwrap_or("订阅").into())
    } else {
        name.trim().into()
    };
    let source = Source {
        id: id.clone(),
        name: title,
        url: url.to_string(),
        kind: "imported".into(),
        archived: false,
        folder: "".into(),
        last_success: None,
        last_error: None,
    };
    let mut seen = std::collections::HashSet::new();
    let mut articles = vec![];
    for entry in feed.entries {
        let title = entry
            .title
            .map(|t| t.content)
            .unwrap_or_else(|| "无标题文章".into());
        let link = entry
            .links
            .iter()
            .find(|l| l.rel.as_deref().is_none_or(|r| r == "alternate"))
            .and_then(|l| url.join(&l.href).ok())
            .filter(|u| safe_url(u.as_str()).is_ok())
            .map(|u| u.to_string());
        let raw = entry
            .content
            .and_then(|c| c.body)
            .or_else(|| entry.summary.map(|s| s.content))
            .unwrap_or_default();
        let clean = ammonia::Builder::default()
            .url_relative(ammonia::UrlRelative::RewriteWithBase(url.clone()))
            .clean(&raw)
            .to_string();
        let excerpt = Html::parse_fragment(&clean)
            .root_element()
            .text()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(220)
            .collect();
        let date = entry
            .published
            .or(entry.updated)
            .map(|d| d.to_rfc3339())
            .unwrap_or_default();
        let key = if !entry.id.is_empty() {
            entry.id
        } else {
            link.clone()
                .unwrap_or_else(|| hash(&format!("{title}\n{date}\n{clean}")))
        };
        if !seen.insert(key.clone()) {
            continue;
        }
        articles.push(Article {
            id: format!("{}:{}", id, hash(&key)),
            source_id: id.clone(),
            title,
            excerpt,
            html: clean,
            date,
            url: link,
            demo: false,
            external_id: Some(key),
        });
    }
    Ok(PreparedFeed {
        source,
        articles,
        etag: None,
        modified: None,
        generation,
    })
}
pub async fn prepare(input: String, name: String, generation: i64) -> Result<PreparedFeed, String> {
    let url = safe_url(&input)?;
    let client = reqwest::Client::builder()
        .user_agent("Modu/0.1 RSS Reader")
        .timeout(std::time::Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|_| "无法初始化网络连接。")?;
    let (bytes, final_url) = fetch(&client, &url).await?;
    if let Ok(feed) = parse(&bytes, &final_url, &name, generation) {
        return Ok(feed);
    }
    let candidates = {
        let html = Html::parse_document(&String::from_utf8_lossy(&bytes));
        let selector = Selector::parse("link[rel~='alternate'][href]").unwrap();
        html.select(&selector)
            .filter(|el| {
                el.value().attr("type").is_some_and(|t| {
                    t.contains("rss") || t.contains("atom") || t.contains("feed+json")
                })
            })
            .filter_map(|el| final_url.join(el.value().attr("href")?).ok())
            .filter(|u| safe_url(u.as_str()).is_ok())
            .take(4)
            .collect::<Vec<_>>()
    };
    for candidate in candidates {
        if let Ok((bytes, resolved)) = fetch(&client, &candidate).await {
            if let Ok(feed) = parse(&bytes, &resolved, &name, generation) {
                return Ok(feed);
            }
        }
    }
    Err("未找到可用订阅。请粘贴网站提供的 RSS / Atom 地址。".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rss_atom_and_stable_ids() {
        let url = Url::parse("https://example.com/feed").unwrap();
        for text in [
            include_str!("../../tests/fixtures/reading.rss"),
            include_str!("../../tests/fixtures/reading.atom"),
        ] {
            let a = parse(text.as_bytes(), &url, "", 0).unwrap();
            let b = parse(text.as_bytes(), &url, "", 0).unwrap();
            assert!(!a.articles.is_empty());
            assert_eq!(a.articles[0].id, b.articles[0].id);
            assert!(!a.articles[0].html.contains("<script"));
        }
    }
    #[test]
    fn unsafe_urls_are_rejected() {
        for u in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://name:password@example.com",
        ] {
            assert!(safe_url(u).is_err())
        }
    }
    #[test]
    fn discovers_relative_feed_and_reports_http_error() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            for body in ["<html><head><link rel='alternate' type='application/rss+xml' href='/feed.xml'></head></html>",include_str!("../../tests/fixtures/reading.rss")] {
                let (mut socket,_)=listener.accept().unwrap();let mut request=[0;4096];let _=socket.read(&mut request);
                write!(socket,"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
            }
        });
        let feed = tauri::async_runtime::block_on(prepare(
            format!("http://{address}/"),
            "Local".into(),
            0,
        ))
        .unwrap();
        assert!(feed.source.url.ends_with("/feed.xml"));
        assert!(!feed.articles.is_empty());
        server.join().unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = [0; 4096];
            let _ = socket.read(&mut request);
            socket
                .write_all(
                    b"HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .unwrap();
        });
        let error =
            tauri::async_runtime::block_on(prepare(format!("http://{address}/"), String::new(), 0))
                .unwrap_err();
        assert!(error.contains("503"));
        server.join().unwrap();
    }
}
