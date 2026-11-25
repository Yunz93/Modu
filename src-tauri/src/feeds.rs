use crate::model::*;
use encoding_rs::{Encoding, UTF_8};
use scraper::{Html, Selector};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fmt::Write;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;
use url::Url;
const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_FULL_TEXT_BYTES: usize = 2 * 1024 * 1024;
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
    read_response(request(client, url).await?).await
}
async fn request(client: &reqwest::Client, url: &Url) -> Result<reqwest::Response, String> {
    client.get(url.clone()).send().await.map_err(|e| {
        if e.is_timeout() {
            "连接超时，请稍后重试。".to_string()
        } else {
            "无法连接订阅，请检查网络和地址。".into()
        }
    })
}
async fn read_response(mut response: reqwest::Response) -> Result<(Vec<u8>, Url), String> {
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

fn network_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("Modu/", env!("CARGO_PKG_VERSION"), " RSS Reader"))
        .timeout(std::time::Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 8 || safe_url(attempt.url().as_str()).is_err() {
                attempt.error("unsupported redirect")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|_| "无法初始化网络连接。".into())
}

struct ArticleRelativeUrl<'a>(&'a Url);

impl<'a> ammonia::UrlRelativeEvaluate<'a> for ArticleRelativeUrl<'a> {
    fn evaluate<'url>(&self, link: &'url str) -> Option<std::borrow::Cow<'url, str>> {
        if link.starts_with('#') {
            Some(std::borrow::Cow::Borrowed(link))
        } else {
            self.0
                .join(link)
                .ok()
                .map(|url| std::borrow::Cow::Owned(url.into()))
        }
    }
}

fn sanitize_markup(input: &str, base: &Url, full_text: bool) -> String {
    let mut sanitizer = ammonia::Builder::default();
    if full_text {
        sanitizer
            .rm_tags(["nav", "footer", "aside", "form", "iframe"])
            .add_clean_content_tags(["nav", "footer", "aside", "form", "iframe"]);
    }
    let mut clean = sanitizer
        .add_tags(["audio", "video", "source", "picture", "track"])
        .add_generic_attributes(["id"])
        .add_tag_attributes("a", ["name"])
        .add_tag_attributes("code", ["class"])
        .add_tag_attributes("pre", ["class"])
        .add_tag_attributes("img", ["data-src", "data-srcset", "srcset"])
        .add_tag_attributes("audio", ["src", "controls"])
        .add_tag_attributes(
            "video",
            [
                "src",
                "controls",
                "poster",
                "width",
                "height",
                "crossorigin",
            ],
        )
        .add_tag_attributes(
            "source",
            ["src", "type", "srcset", "data-srcset", "media", "sizes"],
        )
        .add_tag_attributes("img", ["sizes"])
        .add_tag_attributes("track", ["src", "kind", "srclang", "label", "default"])
        .add_tags([
            "math",
            "semantics",
            "annotation",
            "mrow",
            "mi",
            "mn",
            "mo",
            "mtext",
            "mspace",
            "ms",
            "mfrac",
            "msqrt",
            "mroot",
            "msub",
            "msup",
            "msubsup",
            "munder",
            "mover",
            "munderover",
            "mtable",
            "mtr",
            "mtd",
            "mfenced",
            "mstyle",
            "mpadded",
            "mphantom",
            "menclose",
            "mmultiscripts",
            "mprescripts",
            "none",
        ])
        .add_tag_attributes("math", ["display"])
        .url_schemes(["http", "https"].into_iter().collect())
        .url_relative(ammonia::UrlRelative::Custom(Box::new(ArticleRelativeUrl(
            base,
        ))))
        .clean(input)
        .to_string();
    if input.to_ascii_lowercase().contains("<iframe") {
        let fragment = Html::parse_fragment(input);
        let frames = Selector::parse("iframe[src]").unwrap();
        let mut seen = std::collections::HashSet::new();
        for frame in fragment.select(&frames).take(32) {
            if full_text
                && frame
                    .ancestors()
                    .filter_map(scraper::ElementRef::wrap)
                    .any(|el| matches!(el.value().name(), "nav" | "aside" | "footer" | "form"))
            {
                continue;
            }
            let Some(url) = frame
                .attr("src")
                .and_then(|src| base.join(src).ok())
                .and_then(|url| safe_url(url.as_str()).ok())
            else {
                continue;
            };
            if seen.insert(url.clone()) {
                let _ = write!(
                    clean,
                    "<p><a data-modu-embed=\"\" href=\"{}\">打开嵌入内容</a></p>",
                    escape_markup(url.as_str())
                );
            }
        }
    }
    clean
}

fn escape_markup(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn charset(content_type: &str) -> Option<&'static Encoding> {
    content_type.split(';').skip(1).find_map(|part| {
        let (name, label) = part.split_once('=')?;
        name.trim()
            .eq_ignore_ascii_case("charset")
            .then(|| Encoding::for_label(label.trim().trim_matches(['"', '\'']).as_bytes()))
            .flatten()
    })
}

fn extract_full_text(bytes: &[u8], url: &Url, content_type: &str) -> Result<String, String> {
    let encoding = Encoding::for_bom(bytes)
        .map(|(encoding, _)| encoding)
        .or_else(|| charset(content_type))
        .unwrap_or_else(|| {
            let prefix =
                Html::parse_document(&String::from_utf8_lossy(&bytes[..bytes.len().min(1024)]));
            let meta = Selector::parse("meta[charset], meta[http-equiv=Content-Type i]").unwrap();
            prefix
                .select(&meta)
                .find_map(|element| {
                    element
                        .attr("charset")
                        .and_then(|label| Encoding::for_label(label.as_bytes()))
                        .or_else(|| element.attr("content").and_then(charset))
                })
                .unwrap_or(UTF_8)
        });
    let (decoded, _, _) = encoding.decode(bytes);
    let html = Html::parse_document(&decoded);
    let paragraphs = Selector::parse("p, pre").unwrap();
    let meaningful_elements = Selector::parse("img[src], img[data-src], img[srcset], img[data-srcset], picture source[srcset], picture source[data-srcset], video[src], video source[src], audio[src], audio source[src], table td, table th, math, a[data-modu-embed]").unwrap();
    let prose = Selector::parse("p, pre, blockquote, li").unwrap();
    for region in [
        "[itemprop=articleBody], .entry-content, .post-content, .article-content",
        ".article__main__content",
        "article",
        "main, [role=main]",
    ] {
        let selector = Selector::parse(region).unwrap();
        let best = html.select(&selector).take(32).max_by_key(|element| {
            element
                .select(&paragraphs)
                .take(128)
                .flat_map(|p| p.text())
                .map(|text| text.trim().chars().count())
                .sum::<usize>()
        });
        if let Some(element) = best {
            let cleaned = sanitize_markup(&element.inner_html(), url, true);
            if cleaned.len() > MAX_FULL_TEXT_BYTES {
                return Err("全文超过 2 MB，已保留订阅内容。".into());
            }
            let fragment = Html::parse_fragment(&cleaned);
            let length = fragment
                .select(&paragraphs)
                .flat_map(|p| p.text())
                .map(|text| text.trim().chars().count())
                .sum::<usize>();
            let is_article = !region.starts_with("main");
            let has_short_body = is_article
                && fragment
                    .select(&prose)
                    .any(|element| element.text().any(|text| !text.trim().is_empty()));
            if length >= 80
                || has_short_body
                || fragment.select(&meaningful_elements).next().is_some()
            {
                return Ok(cleaned);
            }
        }
    }
    Err("没有识别到可阅读的全文。".into())
}

fn public_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_documentation()
                || a == 0
                || a >= 224
                || (a == 100 && (64..128).contains(&b))
                || (a == 192 && b == 0 && c == 0)
                || (a == 198 && (18..=19).contains(&b)))
        }
        IpAddr::V6(ip) => {
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return public_ip(mapped.into());
            }
            let [a, b, ..] = ip.segments();
            a & 0xe000 == 0x2000 && a != 0x2002 && !(a == 0x2001 && (b == 0 || b == 0xdb8))
        }
    }
}

fn local_feed(url: &Url) -> bool {
    match url.host() {
        Some(url::Host::Ipv4(ip)) => !public_ip(ip.into()),
        Some(url::Host::Ipv6(ip)) => !public_ip(ip.into()),
        Some(url::Host::Domain(host)) => {
            let host = host.trim_end_matches('.');
            host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local")
        }
        None => false,
    }
}

fn needs_public_article_dns(url: &Url, addresses: &[SocketAddr]) -> bool {
    url.scheme() == "https"
        && !local_feed(url)
        && url.domain().is_some_and(|host| {
            let host = host.trim_end_matches('.');
            host.contains('.')
                && ![
                    ".alt",
                    ".corp",
                    ".example",
                    ".home.arpa",
                    ".i2p",
                    ".internal",
                    ".invalid",
                    ".lan",
                    ".onion",
                    ".test",
                ]
                .iter()
                .any(|suffix| host.ends_with(suffix))
        })
        && !addresses.is_empty()
        && addresses.iter().all(|address| match address.ip() {
            IpAddr::V4(ip) => {
                let [a, b, ..] = ip.octets();
                a == 198 && (18..=19).contains(&b)
            }
            IpAddr::V6(_) => false,
        })
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DnsResponse {
    status: u16,
    #[serde(default)]
    answer: Vec<DnsAnswer>,
}

#[derive(Deserialize)]
struct DnsAnswer {
    #[serde(rename = "type")]
    record_type: u16,
    data: String,
}

fn dns_addresses(bytes: &[u8], record_type: u16, port: u16) -> Vec<SocketAddr> {
    let Ok(result) = serde_json::from_slice::<DnsResponse>(bytes) else {
        return Vec::new();
    };
    if result.status != 0 {
        return Vec::new();
    }
    result
        .answer
        .into_iter()
        .filter(|answer| answer.record_type == record_type)
        .filter_map(|answer| answer.data.parse::<IpAddr>().ok())
        .filter(|ip| ip.is_ipv4() == (record_type == 1))
        .map(|ip| SocketAddr::new(ip, port))
        .collect()
}

async fn query_public_article_dns(
    client: &reqwest::Client,
    host: &str,
    record_type: u16,
    port: u16,
) -> Option<Vec<SocketAddr>> {
    let mut url = Url::parse("https://1.1.1.1/dns-query").unwrap();
    url.query_pairs_mut()
        .append_pair("name", host)
        .append_pair("type", &record_type.to_string());
    let response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/dns-json")
        .send()
        .await
        .ok()?;
    let (bytes, _) = read_response(response).await.ok()?;
    Some(dns_addresses(&bytes, record_type, port))
}

async fn resolve_public_article_host(host: &str, port: u16) -> Result<Vec<SocketAddr>, String> {
    // Fake-IP proxies may answer system DNS from the benchmark range. Ask only
    // for the hostname and never use those virtual addresses for the fetch.
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(4))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法查询全文域名的公网地址。")?;
    let (ipv4, ipv6) = tokio::join!(
        query_public_article_dns(&client, host, 1, port),
        query_public_article_dns(&client, host, 28, port),
    );
    let addresses: Vec<_> = ipv4.into_iter().chain(ipv6).flatten().collect();
    if addresses.is_empty() {
        return Err("无法查询全文域名的公网地址。".into());
    }
    Ok(addresses)
}

async fn pinned_reader_client(url: &Url, allow_local: bool) -> Result<reqwest::Client, String> {
    // A public feed cannot use the native reader to connect to a local service.
    // Resolve then pin the addresses so a second DNS lookup cannot change the destination.
    let blocked = "全文地址指向本地网络，已保留订阅内容。";
    let mut builder = reqwest::Client::builder()
        .user_agent(concat!("Modu/", env!("CARGO_PKG_VERSION"), " RSS Reader"))
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none());
    match url.host() {
        Some(url::Host::Domain(host)) => {
            let port = url.port_or_known_default().ok_or("全文地址无效。")?;
            let mut addresses: Vec<_> = tokio::net::lookup_host((host, port))
                .await
                .map_err(|_| "无法解析全文地址。")?
                .collect();
            if addresses.is_empty() {
                return Err("无法解析全文地址。".into());
            }
            if !allow_local && needs_public_article_dns(url, &addresses) {
                addresses = resolve_public_article_host(host, port).await?;
            }
            if !allow_local && addresses.iter().any(|address| !public_ip(address.ip())) {
                return Err(blocked.into());
            }
            builder = builder.resolve_to_addrs(host, &addresses);
        }
        Some(url::Host::Ipv4(ip)) if allow_local || public_ip(ip.into()) => {}
        Some(url::Host::Ipv6(ip)) if allow_local || public_ip(ip.into()) => {}
        _ => return Err(blocked.into()),
    }
    builder.build().map_err(|_| "无法初始化网络连接。".into())
}

async fn request_article(mut url: Url, source: Url) -> Result<(Vec<u8>, Url, String), String> {
    for _ in 0..=8 {
        let allow_local = local_feed(&source) && source.origin() == url.origin();
        let client = pinned_reader_client(&url, allow_local).await?;
        let response = request(&client, &url).await?;
        if !response.status().is_redirection() {
            let content_type = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default()
                .to_owned();
            let (bytes, resolved) = read_response(response).await?;
            return Ok((bytes, resolved, content_type));
        }
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or("全文重定向地址无效。")?;
        let target = url.join(location).map_err(|_| "全文重定向地址无效。")?;
        url = safe_url(target.as_str())?;
    }
    Err("全文重定向次数过多。".into())
}

pub async fn fetch_full_text(address: &str, source: &str) -> Result<String, String> {
    let (bytes, resolved, content_type) = tokio::time::timeout(
        Duration::from_secs(20),
        request_article(safe_url(address)?, safe_url(source)?),
    )
    .await
    .map_err(|_| "获取全文超时。")??;
    tokio::task::spawn_blocking(move || extract_full_text(&bytes, &resolved, &content_type))
        .await
        .map_err(|_| "无法解析全文。")?
}

fn article_image_referrer(article: &Url, image: &Url) -> Option<&'static str> {
    (article.scheme() == "https"
        && article.port_or_known_default() == Some(443)
        && matches!(
            article.host_str(),
            Some("sspai.com" | "www.sspai.com" | "go-post.sspai.com")
        )
        && image.scheme() == "https"
        && image.port_or_known_default() == Some(443)
        && image.host_str() == Some("cdnfile.sspai.com"))
    .then_some("https://sspai.com/")
}

pub async fn fetch_full_text_image(
    article_url: &str,
    html: &str,
    address: &str,
) -> Result<Vec<u8>, String> {
    let article = safe_url(article_url)?;
    let image = safe_url(address)?;
    let referrer = article_image_referrer(&article, &image).ok_or("这张图片不支持补取。")?;
    let in_article = {
        let fragment = Html::parse_fragment(html);
        let selector = Selector::parse("img[src], img[data-src]").unwrap();
        let mut images = fragment.select(&selector);
        images.any(|element| {
            ["src", "data-src"].into_iter().any(|attribute| {
                element
                    .attr(attribute)
                    .and_then(|value| article.join(value.trim()).ok())
                    .and_then(|url| safe_url(url.as_str()).ok())
                    .is_some_and(|url| url == image)
            })
        })
    };
    if !in_article {
        return Err("这张图片不在缓存正文中。".into());
    }
    tokio::time::timeout(Duration::from_secs(15), async {
        let client = pinned_reader_client(&image, false).await?;
        let response = client
            .get(image)
            .header(reqwest::header::REFERER, referrer)
            .send()
            .await
            .map_err(|_| "无法下载正文图片。")?;
        let mime = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next());
        if !matches!(
            mime,
            Some("image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif")
        ) {
            return Err("地址没有返回受支持的图片。".into());
        }
        let (bytes, _) = read_response(response).await?;
        Ok(bytes)
    })
    .await
    .map_err(|_| "补取正文图片超时。")?
}

fn entry_body(entry: &feed_rs::model::Entry) -> &str {
    entry
        .content
        .as_ref()
        .and_then(|content| content.body.as_deref())
        .or_else(|| {
            entry
                .summary
                .as_ref()
                .map(|summary| summary.content.as_str())
        })
        .unwrap_or_default()
}

fn media_tag(url: &Url, mime: Option<&str>) -> Option<&'static str> {
    match mime.and_then(|mime| mime.split('/').next()) {
        Some("image") => return Some("img"),
        Some("audio") => return Some("audio"),
        Some("video") => return Some("video"),
        _ => {}
    }
    match url.path().rsplit_once('.')?.1.to_ascii_lowercase().as_str() {
        "avif" | "bmp" | "gif" | "ico" | "jpeg" | "jpg" | "png" | "svg" | "webp" => Some("img"),
        "aac" | "flac" | "m4a" | "mp3" | "oga" | "ogg" | "opus" | "wav" => Some("audio"),
        "m3u8" | "m4v" | "mov" | "mp4" | "ogv" | "webm" => Some("video"),
        _ => None,
    }
}

#[derive(Deserialize)]
struct RssAttachments {
    channel: RssChannel,
}

#[derive(Deserialize)]
struct RssChannel {
    #[serde(rename = "item", default)]
    items: Vec<RssItem>,
}

#[derive(Deserialize)]
struct RssItem {
    #[serde(rename = "enclosure", default)]
    enclosures: Vec<RssEnclosure>,
}

#[derive(Deserialize)]
struct RssEnclosure {
    #[serde(rename = "@url")]
    url: Option<String>,
    #[serde(rename = "@type")]
    mime: Option<String>,
}

fn append_attachments(
    html: &mut String,
    inline: &Html,
    entry: &feed_rs::model::Entry,
    rss: Option<&RssItem>,
    feed_url: &Url,
    article_url: &Url,
) {
    let from_media = entry
        .media
        .iter()
        .flat_map(|group| &group.content)
        .filter_map(|media| {
            Some((
                media.url.as_ref()?.clone(),
                media.content_type.as_ref().map(|mime| mime.as_str()),
            ))
        });
    let from_links = entry
        .links
        .iter()
        .filter(|link| link.rel.as_deref() == Some("enclosure"))
        .filter_map(|link| Some((feed_url.join(&link.href).ok()?, link.media_type.as_deref())));
    let from_rss = rss
        .into_iter()
        .flat_map(|item| &item.enclosures)
        .filter_map(|file| {
            Some((
                feed_url.join(file.url.as_deref()?).ok()?,
                file.mime.as_deref(),
            ))
        });
    let attachments: Vec<_> = from_media
        .chain(from_links)
        .chain(from_rss)
        .take(32)
        .collect();
    if attachments.is_empty() {
        return;
    }
    let selector = Selector::parse(
        "img[src], img[data-src], audio[src], video[src], audio source[src], video source[src]",
    )
    .unwrap();
    let mut seen = inline
        .select(&selector)
        .filter_map(|element| {
            let attrs = element.value();
            attrs
                .attr("src")
                .or_else(|| attrs.attr("data-src"))
                .and_then(|src| article_url.join(src).ok())
                .and_then(|url| safe_url(url.as_str()).ok())
        })
        .collect::<std::collections::HashSet<_>>();
    for (url, mime) in attachments {
        let Ok(url) = safe_url(url.as_str()) else {
            continue;
        };
        if !seen.insert(url.clone()) {
            continue;
        }
        let src = escape_markup(url.as_str());
        match media_tag(&url, mime) {
            Some("img") => {
                let _ = write!(html, r#"<img src="{src}" alt="" loading="lazy">"#);
            }
            Some(tag) => {
                let _ = write!(
                    html,
                    r#"<{tag} src="{src}" controls preload="none"></{tag}>"#
                );
            }
            None => {
                let _ = write!(
                    html,
                    r#"<p><a href="{src}" data-modu-attachment="">打开附件</a></p>"#
                );
            }
        }
    }
}

pub fn parse(bytes: &[u8], url: &Url, name: &str, generation: i64) -> Result<PreparedFeed, String> {
    let feed = feed_rs::parser::Builder::new()
        .base_uri(Some(url.as_str()))
        .id_generator(|_, _, _| String::new())
        .sanitize_content(false)
        .build()
        .parse(bytes)
        .map_err(|_| "这个地址没有返回有效的 RSS 或 Atom 订阅。")?;
    // feed-rs may prefer Media RSS or podcast media over RSS enclosures in the same item.
    let rss = (feed.feed_type == feed_rs::model::FeedType::RSS2)
        .then(|| quick_xml::de::from_reader::<_, RssAttachments>(bytes).ok())
        .flatten()
        .filter(|rss| rss.channel.items.len() == feed.entries.len());
    let id = format!("feed:{}", hash(url.as_str()));
    let title = if name.trim().is_empty() {
        feed.title
            .map(|mut t| {
                t.sanitize();
                t.content
            })
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
        folder_path: vec![],
        last_success: None,
        last_error: None,
    };
    let atom = feed.feed_type == feed_rs::model::FeedType::Atom;
    let mut seen = std::collections::HashSet::new();
    let mut articles = vec![];
    for (index, mut entry) in feed.entries.into_iter().enumerate() {
        let title = entry
            .title
            .take()
            .map(|mut t| {
                t.sanitize();
                t.content
            })
            .unwrap_or_else(|| "无标题文章".into());
        let link = entry
            .links
            .iter()
            .find(|l| l.rel.as_deref().is_none_or(|r| r == "alternate"))
            .and_then(|l| url.join(&l.href).ok())
            .filter(|u| safe_url(u.as_str()).is_ok())
            .map(|u| u.to_string());
        let base = link
            .as_deref()
            .and_then(|href| Url::parse(href).ok())
            .unwrap_or_else(|| url.clone());
        let has_inline_content = entry
            .content
            .as_ref()
            .and_then(|content| content.body.as_deref())
            .is_some_and(|content| !content.trim().is_empty());
        let plain_atom = atom
            && (if has_inline_content {
                entry.content.as_ref().map(|content| &content.content_type)
            } else {
                entry.summary.as_ref().map(|summary| &summary.content_type)
            })
            .is_some_and(|mime| mime.as_str() == "text/plain");
        let body = entry_body(&entry);
        let mut clean = if plain_atom {
            format!(
                "<div class=\"feed-plain-text\">{}</div>",
                escape_markup(body)
            )
        } else {
            sanitize_markup(body, &base, false)
        };
        let inline = Html::parse_fragment(&clean);
        let excerpt = inline
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
            entry.id.clone()
        } else if let Some(link) = &link {
            link.clone()
        } else {
            // Use the pre-media sanitizer for the established ID of entries without a link or GUID.
            if let Some(content) = &mut entry.content {
                content.sanitize();
            }
            if let Some(summary) = &mut entry.summary {
                summary.sanitize();
            }
            let legacy = ammonia::Builder::default()
                .url_relative(ammonia::UrlRelative::RewriteWithBase(url.clone()))
                .clean(entry_body(&entry));
            hash(&format!("{title}\n{date}\n{legacy}"))
        };
        if !seen.insert(key.clone()) {
            continue;
        }
        append_attachments(
            &mut clean,
            &inline,
            &entry,
            rss.as_ref().map(|rss| &rss.channel.items[index]),
            url,
            &base,
        );
        articles.push(Article {
            id: format!("{}:{}", id, hash(&key)),
            source_id: id.clone(),
            title,
            excerpt,
            html: clean,
            has_inline_content: Some(has_inline_content),
            full_text_html: None,
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
    let client = network_client()?;
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
    fn full_text_extracts_article_content_and_discards_navigation_and_frames() {
        let page = format!(
            "<nav>Site menu</nav><main><article><aside>Recommendations</aside><p>{}</p><img src='cover.png' onerror='blocked()'><iframe src='https://example.com'></iframe></article></main>",
            "This is the body of a fixture article. ".repeat(4)
        );
        let url = Url::parse("https://example.org/posts/one").unwrap();
        let full = extract_full_text(page.as_bytes(), &url, "text/html").unwrap();
        assert!(full.contains("body of a fixture article"));
        assert!(full.contains("https://example.org/posts/cover.png"));
        for excluded in ["Site menu", "Recommendations", "onerror", "iframe"] {
            assert!(!full.contains(excluded));
        }
        assert!(extract_full_text(b"<main><p>Log in</p></main>", &url, "text/html").is_err());
    }
    #[test]
    fn full_text_prefers_sspai_body_over_article_controls() {
        let body = "这是正文中的段落，图片也应该保留下来。".repeat(6);
        let page = format!(
            "<article>
               <div class='article__header'><p>Share controls</p><img src='/qr.png'></div>
               <div class='article__main__content wangEditor-txt'><p>{body}</p><img src='/figure.png'></div>
               <div class='article__footer'><p>Author information</p></div>
             </article>"
        );
        let url = Url::parse("https://sspai.com/post/119023").unwrap();
        let full = extract_full_text(page.as_bytes(), &url, "text/html").unwrap();
        assert!(full.contains(&body) && full.contains("https://sspai.com/figure.png"));
        assert!(!full.contains("Share controls") && !full.contains("Author information"));
        assert!(!full.contains("qr.png"));
    }

    #[test]
    fn full_text_keeps_short_articles_galleries_and_content_structure() {
        let url = Url::parse("https://example.org/posts/one").unwrap();
        for page in [
            "<article><p>A short post.</p></article>",
            "<article><figure><picture><source srcset='large.png 2x'><img alt='Cover'></picture><figcaption>Cover</figcaption></figure></article>",
            "<main><table><tr><td>1</td></tr></table></main>",
        ] {
            assert!(extract_full_text(page.as_bytes(), &url, "text/html").is_ok());
        }
        let page = r##"<article><p><a href="#note">Note</a></p><p id="note">Footnote</p>
            <pre><code class="language-js">let x = 1;</code></pre>
            <math display="block"><mfrac><mi>x</mi><mn>2</mn></mfrac></math>
            <video src="clip.mp4"><track src="captions.vtt" kind="captions" srclang="en"></video>
            <iframe src="https://example.org/player"></iframe></article>"##;
        let full = extract_full_text(page.as_bytes(), &url, "text/html").unwrap();
        for kept in [
            "href=\"#note\"",
            "id=\"note\"",
            "class=\"language-js\"",
            "<mfrac>",
            "https://example.org/posts/captions.vtt",
            "https://example.org/player",
        ] {
            assert!(full.contains(kept), "{kept} missing in {full}");
        }
        assert!(!full.contains("<iframe"));
    }

    #[test]
    fn atom_plain_text_and_document_attachments_are_preserved() {
        let url = Url::parse("https://example.org/feed").unwrap();
        let atom = br#"<feed xmlns="http://www.w3.org/2005/Atom"><title>Notes</title><entry>
            <id>urn:notes:1</id><title>Example</title>
            <content type="text">Vec&lt;T&gt;
  &lt;div&gt; &amp; end</content>
            <link rel="enclosure" href="report.pdf" type="application/pdf" />
            </entry></feed>"#;
        let parsed = parse(atom, &url, "", 0).unwrap();
        let html = &parsed.articles[0].html;
        assert!(
            html.contains("Vec&lt;T&gt;\n  &lt;div&gt; &amp; end"),
            "{html}"
        );
        assert!(html.contains("data-modu-attachment"));
        assert!(html.contains("https://example.org/report.pdf"));
    }

    #[test]
    fn full_text_only_falls_back_for_virtual_dns_on_https_domains() {
        let page = Url::parse("https://sspai.com/post/119023").unwrap();
        let virtual_ip: SocketAddr = "198.18.0.35:443".parse().unwrap();
        let public = "119.23.141.248:443".parse().unwrap();
        let private = "192.168.0.10:443".parse().unwrap();
        assert!(needs_public_article_dns(&page, &[virtual_ip]));
        assert!(!public_ip(virtual_ip.ip()));
        for excluded in [&[][..], &[private], &[public], &[virtual_ip, private]] {
            assert!(!needs_public_article_dns(&page, excluded));
        }
        for address in [
            "http://sspai.com/post/119023",
            "https://myhost.local/post",
            "https://printer.home.arpa/post",
            "https://myhost.internal/post",
            "https://private.onion/post",
            "https://private.i2p/post",
            "https://private.alt/post",
            "https://myhost/post",
            "https://198.18.0.35/post",
        ] {
            let url = Url::parse(address).unwrap();
            assert!(!needs_public_article_dns(&url, &[virtual_ip]), "{url}");
        }
    }

    #[test]
    fn full_text_dns_parses_address_records_and_rejects_failed_responses() {
        let response = br#"{
          "Status": 0,
          "Answer": [
            {"type":5,"data":"canonical.example."},
            {"type":1,"data":"119.23.141.248"},
            {"type":28,"data":"2606:4700:4700::1111"}
          ]
        }"#;
        assert_eq!(
            dns_addresses(response, 1, 443),
            ["119.23.141.248:443".parse().unwrap()]
        );
        assert_eq!(
            dns_addresses(response, 28, 8443),
            ["[2606:4700:4700::1111]:8443".parse().unwrap()]
        );
        assert!(dns_addresses(br#"{"Status":3}"#, 1, 443).is_empty());
    }

    #[test]
    fn full_text_image_referrer_is_scoped_to_sspai_cdn() {
        let article = safe_url("https://sspai.com/post/118879").unwrap();
        let image = safe_url("https://cdnfile.sspai.com/picture.jpg").unwrap();
        assert_eq!(
            article_image_referrer(&article, &image),
            Some("https://sspai.com/")
        );
        for unlisted in [
            "http://cdnfile.sspai.com/picture.jpg",
            "https://cdnfile.sspai.com:8443/picture.jpg",
            "https://cdnfile.sspai.com.example.org/picture.jpg",
        ] {
            assert_eq!(
                article_image_referrer(&article, &safe_url(unlisted).unwrap()),
                None
            );
        }
        let other = safe_url("https://example.org/post").unwrap();
        assert_eq!(article_image_referrer(&other, &image), None);
    }

    #[tokio::test]
    async fn full_text_image_requires_an_image_in_the_cached_body() {
        let image = "https://cdnfile.sspai.com/picture.jpg";
        let link = format!("<a href='{image}'>download</a>");
        let error = fetch_full_text_image("https://sspai.com/post/118879", &link, image)
            .await
            .unwrap_err();
        assert!(error.contains("不在缓存正文中"));
    }

    #[test]
    fn full_text_respects_http_and_html_charsets() {
        let text = "这是一篇使用简体中文编码的测试文章。".repeat(6);
        let page = format!("<meta charset=gbk><article><p>{text}</p></article>");
        let (bytes, _, _) = encoding_rs::GBK.encode(&page);
        let url = Url::parse("https://example.org/article").unwrap();
        for content_type in ["text/html", "text/html; Charset=\"gb18030\""] {
            assert!(extract_full_text(&bytes, &url, content_type)
                .unwrap()
                .contains(&text));
        }
    }
    #[tokio::test]
    async fn full_text_denies_private_addresses_for_public_feeds() {
        let local = "http://127.0.0.1:33777/page";
        let error = fetch_full_text(local, "https://example.org/feed.xml")
            .await
            .unwrap_err();
        assert!(error.contains("本地网络"));
        for address in [
            "10.0.0.1",
            "169.254.2.1",
            "100.64.0.1",
            "198.18.0.35",
            "::1",
            "::ffff:127.0.0.1",
            "fc00::1",
        ] {
            assert!(!public_ip(address.parse().unwrap()));
        }
    }
    #[test]
    fn keeps_inline_media_and_feed_attachments_without_active_content() {
        let url = Url::parse("http://127.0.0.1:15324/feed.rss").unwrap();
        let rss = include_str!("../../tests/fixtures/media.rss");
        let feed = parse(rss.as_bytes(), &url, "", 0).unwrap();
        let html = &feed.articles[0].html;
        assert_eq!(
            html.matches("src=\"http://127.0.0.1:15324/articles/cover.png\"")
                .count(),
            1
        );
        assert!(html.contains("<video poster=\"http://127.0.0.1:15324/cover.png\">"));
        assert!(html.contains("<source src=\"http://127.0.0.1:15324/clip.mp4\""));
        assert!(html.contains(
            "<audio src=\"http://127.0.0.1:15324/episode.wav?quality=high&amp;fixture=1\""
        ));
        for forbidden in ["autoplay", "onerror", "<iframe", "<script", "file://"] {
            assert!(!html.contains(forbidden), "{html}");
        }

        let legacy = feed_rs::parser::Builder::new()
            .base_uri(Some(url.as_str()))
            .id_generator(|_, _, _| String::new())
            .build()
            .parse(rss.as_bytes())
            .unwrap();
        let clean = ammonia::Builder::default()
            .url_relative(ammonia::UrlRelative::RewriteWithBase(url))
            .clean(entry_body(&legacy.entries[1]));
        assert_eq!(
            feed.articles[1].external_id.as_deref(),
            Some(hash(&format!("兼容旧文章标识\n\n{clean}")).as_str())
        );
    }

    #[test]
    fn keeps_atom_enclosures() {
        let url = Url::parse("http://127.0.0.1:15324/feed.atom").unwrap();
        let feed = parse(
            include_bytes!("../../tests/fixtures/media.atom"),
            &url,
            "",
            0,
        )
        .unwrap();
        assert!(feed.articles[0]
            .html
            .contains("src=\"http://127.0.0.1:15324/articles/cover.png\""));
        assert!(feed.articles[0]
            .html
            .contains("<audio src=\"http://127.0.0.1:15324/episode.wav\""));
    }

    #[test]
    fn rss_atom_and_stable_ids() {
        let url = Url::parse("https://example.com/feed").unwrap();
        for (text, has_inline_content) in [
            (include_str!("../../tests/fixtures/reading.rss"), false),
            (include_str!("../../tests/fixtures/reading.atom"), true),
            (include_str!("../../tests/fixtures/media.rss"), true),
        ] {
            let a = parse(text.as_bytes(), &url, "", 0).unwrap();
            let b = parse(text.as_bytes(), &url, "", 0).unwrap();
            assert!(!a.articles.is_empty());
            assert_eq!(a.articles[0].id, b.articles[0].id);
            assert_eq!(a.articles[0].has_inline_content, Some(has_inline_content));
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
