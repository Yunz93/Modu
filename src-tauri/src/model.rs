use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FontSizes {
    min: i64,
    default: i64,
    legacy_reading_max: i64,
}

static FONT_SIZES: LazyLock<FontSizes> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../src/font-sizes.json"))
        .expect("valid bundled font size settings")
});

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub name: String,
    pub url: String,
    pub kind: String,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub folder: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub folder_path: Vec<String>,
    #[serde(default)]
    pub last_success: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Article {
    pub id: String,
    pub source_id: String,
    pub title: String,
    pub excerpt: String,
    pub html: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub full_text_html: Option<String>,
    pub date: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default)]
    pub demo: bool,
    #[serde(default)]
    pub external_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub version: u32,
    pub sources: Vec<Source>,
    pub articles: Vec<Article>,
    pub read: Vec<String>,
    pub saved: Vec<String>,
    pub positions: HashMap<String, f64>,
    pub preferences: serde_json::Value,
    pub selected_id: Option<String>,
}
impl Default for Library {
    fn default() -> Self {
        Self {
            version: 1,
            sources: vec![],
            articles: vec![],
            read: vec![],
            saved: vec![],
            positions: HashMap::new(),
            preferences: serde_json::json!({"fontSize":FONT_SIZES.default,"font":"sans","theme":"night","accentColor":"","uiFontFamily":"","readingFontFamily":""}),
            selected_id: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserState {
    pub read: Vec<String>,
    pub saved: Vec<String>,
    pub positions: HashMap<String, f64>,
    pub preferences: serde_json::Value,
    pub selected_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedFeed {
    pub source: Source,
    pub articles: Vec<Article>,
    pub etag: Option<String>,
    pub modified: Option<String>,
    pub generation: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedContent {
    pub sources: Vec<Source>,
    pub articles: Vec<Article>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Changes {
    pub source: Source,
    pub articles: Vec<Article>,
    pub new_count: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Loaded {
    pub library: Library,
    pub revision: i64,
    pub data_path: String,
}

pub fn validate_library(library: &Library) -> Result<(), String> {
    if library.version != 1 {
        return Err("不支持这个备份版本，当前阅读库未修改。".into());
    }
    let prefs = &library.preferences;
    // Older libraries may contain a size above the current slider maximum.
    let reading_size_range = FONT_SIZES.min as f64..=FONT_SIZES.legacy_reading_max as f64;
    if !["paper", "night"].contains(&prefs["theme"].as_str().unwrap_or(""))
        || !["serif", "sans"].contains(&prefs["font"].as_str().unwrap_or(""))
        || !prefs["fontSize"]
            .as_f64()
            .is_some_and(|n| reading_size_range.contains(&n))
    {
        return Err("备份中的阅读外观无效，当前阅读库未修改。".into());
    }
    if prefs
        .get("autoCheckUpdates")
        .is_some_and(|v| !v.is_boolean())
        || prefs
            .get("skippedUpdateVersion")
            .is_some_and(|v| !v.is_string())
        || prefs
            .get("lastUpdateCheckAt")
            .is_some_and(|v| !v.is_string())
    {
        return Err("阅读库中的更新偏好格式无效，原数据保持不变。".into());
    }
    let valid_url = |value: &str| {
        url::Url::parse(value).ok().is_some_and(|u| {
            ["http", "https"].contains(&u.scheme())
                && u.username().is_empty()
                && u.password().is_none()
        })
    };
    if library.sources.iter().any(|source| {
        source.id.is_empty()
            || source.folder_path.len() > 32
            || !["demo", "imported", "pending"].contains(&source.kind.as_str())
            || !valid_url(&source.url)
    }) || library.articles.iter().any(|article| {
        article.id.is_empty()
            || (!article.date.is_empty()
                && chrono::DateTime::parse_from_rfc3339(&article.date).is_err())
            || article.url.as_ref().is_some_and(|u| !valid_url(u))
    }) {
        return Err("阅读库中的订阅地址或文章日期无效，原数据保持不变。".into());
    }
    let sources: std::collections::HashSet<_> = library.sources.iter().map(|s| &s.id).collect();
    let articles: std::collections::HashSet<_> = library.articles.iter().map(|a| &a.id).collect();
    if sources.len() != library.sources.len()
        || articles.len() != library.articles.len()
        || library
            .articles
            .iter()
            .any(|a| !sources.contains(&a.source_id))
        || library
            .positions
            .values()
            .any(|v| !v.is_finite() || *v < 0.0)
    {
        return Err("备份中的文章引用或阅读位置无效，当前阅读库未修改。".into());
    }
    Ok(())
}
