use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
            preferences: serde_json::json!({"fontSize":23,"font":"serif","theme":"night","accentColor":"","uiFontFamily":"","readingFontFamily":""}),
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
    if !["paper", "night"].contains(&prefs["theme"].as_str().unwrap_or(""))
        || !["serif", "sans"].contains(&prefs["font"].as_str().unwrap_or(""))
        || !prefs["fontSize"]
            .as_f64()
            .is_some_and(|n| n.is_finite() && (16.0..=28.0).contains(&n))
    {
        return Err("备份中的阅读外观无效，当前阅读库未修改。".into());
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
