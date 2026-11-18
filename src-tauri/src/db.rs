use crate::model::*;
use rusqlite::{params, Connection};
use std::{fs, path::PathBuf};

pub struct Database {
    conn: Connection,
    pub path: PathBuf,
}
fn err(e: impl std::fmt::Display) -> String {
    format!("本地阅读库读写失败：{e}")
}
impl Database {
    pub fn open(dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&dir).map_err(err)?;
        let path = dir.join("library.sqlite3");
        let existing = path.exists();
        let conn = Connection::open(&path).map_err(err)?;
        if existing {
            let tables: i64 = conn.query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('sources','articles','state')", [], |row| row.get(0)).map_err(err)?;
            let has_state = tables == 3
                && conn
                    .query_row("SELECT EXISTS(SELECT 1 FROM state WHERE id=1)", [], |row| {
                        row.get::<_, bool>(0)
                    })
                    .map_err(err)?;
            if !has_state {
                return Err("本地阅读库结构不完整，原数据保持不变。请从完整备份恢复。".into());
            }
        }
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
          CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, data TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS articles(id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), external_key TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(source_id,external_key));
          CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, generation INTEGER NOT NULL, data TEXT NOT NULL);").map_err(err)?;
        let empty = Library::default();
        let state = UserState {
            read: empty.read,
            saved: empty.saved,
            positions: empty.positions,
            preferences: empty.preferences,
            selected_id: None,
        };
        conn.execute(
            "INSERT OR IGNORE INTO state VALUES(1,0,0,?1)",
            [serde_json::to_string(&state).map_err(err)?],
        )
        .map_err(err)?;
        Ok(Self { conn, path })
    }
    pub fn backup_before_update(&self) -> Result<(), String> {
        let folder = self.path.parent().unwrap().join("backups");
        fs::create_dir_all(&folder).map_err(err)?;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(err)?
            .as_nanos();
        let data = serde_json::to_vec_pretty(&self.load()?.library).map_err(err)?;
        use std::io::Write;
        let mut file =
            fs::File::create(folder.join(format!("before-update-{stamp}.json"))).map_err(err)?;
        file.write_all(&data)
            .and_then(|_| file.sync_all())
            .map_err(err)
    }
    pub fn stored_preferences(&self) -> serde_json::Value {
        self.conn
            .query_row(
                "SELECT json_extract(data,'$.preferences') FROM state WHERE id=1",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }
    pub fn record_feed_failure(&mut self, id: &str, message: &str) -> Result<Source, String> {
        let data: String = self
            .conn
            .query_row("SELECT data FROM sources WHERE id=?1", [id], |r| r.get(0))
            .map_err(err)?;
        let mut source: Source = serde_json::from_str(&data).map_err(err)?;
        source.last_error = Some(message.chars().take(400).collect());
        self.conn
            .execute(
                "UPDATE sources SET data=?1 WHERE id=?2",
                params![serde_json::to_string(&source).map_err(err)?, id],
            )
            .map_err(err)?;
        Ok(source)
    }
    pub fn restore_source(&mut self, id: &str) -> Result<Loaded, String> {
        let data: String = self
            .conn
            .query_row("SELECT data FROM sources WHERE id=?1", [id], |r| r.get(0))
            .map_err(err)?;
        let mut source: Source = serde_json::from_str(&data).map_err(err)?;
        source.archived = false;
        self.conn
            .execute(
                "UPDATE sources SET data=?1 WHERE id=?2",
                params![serde_json::to_string(&source).map_err(err)?, id],
            )
            .map_err(err)?;
        self.load()
    }
    pub fn generation(&self) -> Result<i64, String> {
        self.conn
            .query_row("SELECT generation FROM state WHERE id=1", [], |r| r.get(0))
            .map_err(err)
    }
    pub fn load(&self) -> Result<Loaded, String> {
        let (revision, data): (i64, String) = self
            .conn
            .query_row("SELECT revision,data FROM state WHERE id=1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .map_err(err)?;
        let state: UserState = serde_json::from_str(&data).map_err(err)?;
        let mut sources = vec![];
        let mut articles = vec![];
        let mut stmt = self
            .conn
            .prepare("SELECT data FROM sources ORDER BY rowid")
            .map_err(err)?;
        for row in stmt.query_map([], |r| r.get::<_, String>(0)).map_err(err)? {
            sources.push(serde_json::from_str(&row.map_err(err)?).map_err(err)?);
        }
        let mut stmt = self
            .conn
            .prepare(
                "SELECT data FROM articles ORDER BY json_extract(data,'$.date') DESC,rowid DESC",
            )
            .map_err(err)?;
        for row in stmt.query_map([], |r| r.get::<_, String>(0)).map_err(err)? {
            articles.push(serde_json::from_str(&row.map_err(err)?).map_err(err)?);
        }
        let library = Library {
            version: 1,
            sources,
            articles,
            read: state.read,
            saved: state.saved,
            positions: state.positions,
            preferences: state.preferences,
            selected_id: state.selected_id,
        };
        validate_library(&library)?;
        Ok(Loaded {
            library,
            revision,
            data_path: self.path.to_string_lossy().into(),
        })
    }
    pub fn save(&mut self, state: UserState, expected: i64) -> Result<i64, String> {
        let check = Library {
            preferences: state.preferences.clone(),
            ..Library::default()
        };
        validate_library(&check)?;
        if state.positions.values().any(|v| !v.is_finite() || *v < 0.) {
            return Err("阅读位置无效，未保存。".into());
        }
        let count = self
            .conn
            .execute(
                "UPDATE state SET data=?1,revision=revision+1 WHERE id=1 AND revision=?2",
                params![serde_json::to_string(&state).map_err(err)?, expected],
            )
            .map_err(err)?;
        if count != 1 {
            return Err("阅读库已发生变化，请重新打开以避免覆盖数据。".into());
        }
        Ok(expected + 1)
    }
    pub fn import(&mut self, library: Library, replace: bool) -> Result<Loaded, String> {
        validate_library(&library)?;
        if replace {
            let old = self.load()?.library;
            let dir = self.path.parent().unwrap().join("backups");
            fs::create_dir_all(&dir).map_err(err)?;
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(err)?
                .as_nanos();
            fs::write(
                dir.join(format!("before-restore-{stamp}.json")),
                serde_json::to_vec_pretty(&old).map_err(err)?,
            )
            .map_err(err)?;
        }
        let tx = self.conn.transaction().map_err(err)?;
        if replace {
            tx.execute_batch("DELETE FROM articles; DELETE FROM sources;")
                .map_err(err)?;
        }
        for source in &library.sources {
            tx.execute("INSERT INTO sources(id,data) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![source.id,serde_json::to_string(source).map_err(err)?]).map_err(err)?;
        }
        for article in &library.articles {
            let mut a = article.clone();
            let key = external_key(&a);
            a.external_id = Some(key.clone());
            let existing: Option<String> = tx
                .query_row(
                    "SELECT id FROM articles WHERE source_id=?1 AND external_key=?2",
                    params![a.source_id, key],
                    |r| r.get(0),
                )
                .ok();
            if let Some(id) = existing {
                a.id = id;
            }
            tx.execute("INSERT INTO articles VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![a.id,a.source_id,key,serde_json::to_string(&a).map_err(err)?]).map_err(err)?;
        }
        if replace {
            let state = UserState {
                read: library.read,
                saved: library.saved,
                positions: library.positions,
                preferences: library.preferences,
                selected_id: library.selected_id,
            };
            tx.execute(
                "UPDATE state SET data=?1,revision=revision+1,generation=generation+1 WHERE id=1",
                [serde_json::to_string(&state).map_err(err)?],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)?;
        self.load()
    }
    pub fn commit_feed(&mut self, feed: PreparedFeed) -> Result<Changes, String> {
        if feed.generation != self.generation()? {
            return Err("阅读库已经恢复，请重新刷新订阅。".into());
        }
        let existing_source: Option<String> = self
            .conn
            .query_row(
                "SELECT data FROM sources WHERE json_extract(data,'$.url')=?1",
                [&feed.source.url],
                |r| r.get(0),
            )
            .ok();
        let mut source = feed.source;
        if let Some(data) = existing_source {
            let old: Source = serde_json::from_str(&data).map_err(err)?;
            source.id = old.id;
            source.name = old.name;
            source.archived = old.archived;
            source.folder = old.folder;
        }
        let tx = self.conn.transaction().map_err(err)?;
        tx.execute(
            "INSERT INTO sources VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            params![source.id, serde_json::to_string(&source).map_err(err)?],
        )
        .map_err(err)?;
        let mut articles = vec![];
        let mut new_count = 0;
        for mut a in feed.articles {
            a.source_id = source.id.clone();
            let key = external_key(&a);
            a.external_id = Some(key.clone());
            let id: Option<String> = tx
                .query_row(
                    "SELECT id FROM articles WHERE source_id=?1 AND external_key=?2",
                    params![source.id, key],
                    |r| r.get(0),
                )
                .ok();
            if let Some(id) = id {
                a.id = id;
            } else {
                new_count += 1;
            }
            tx.execute("INSERT INTO articles VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![a.id,a.source_id,key,serde_json::to_string(&a).map_err(err)?]).map_err(err)?;
            articles.push(a);
        }
        tx.commit().map_err(err)?;
        Ok(Changes {
            source,
            articles,
            new_count,
        })
    }
    pub fn remove_source(&mut self, id: &str) -> Result<Loaded, String> {
        // Unsubscribe keeps cached articles and their reading state.
        let data: String = self
            .conn
            .query_row("SELECT data FROM sources WHERE id=?1", [id], |r| r.get(0))
            .map_err(err)?;
        let mut source: Source = serde_json::from_str(&data).map_err(err)?;
        source.archived = true;
        self.conn
            .execute(
                "UPDATE sources SET data=?1 WHERE id=?2",
                params![serde_json::to_string(&source).map_err(err)?, id],
            )
            .map_err(err)?;
        self.load()
    }
}
fn external_key(a: &Article) -> String {
    a.external_id.clone().unwrap_or_else(|| {
        a.id.strip_prefix(&format!("{}:", a.source_id))
            .map(|s| {
                percent_encoding::percent_decode_str(s)
                    .decode_utf8_lossy()
                    .into_owned()
            })
            .unwrap_or_else(|| a.url.clone().unwrap_or_else(|| a.id.clone()))
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> PreparedFeed {
        PreparedFeed {
            source: Source {
                id: "s".into(),
                name: "Feed".into(),
                url: "https://example.com/feed".into(),
                kind: "imported".into(),
                archived: false,
                folder: "".into(),
                last_success: None,
                last_error: None,
            },
            articles: vec![Article {
                id: "a".into(),
                source_id: "s".into(),
                title: "One".into(),
                excerpt: "".into(),
                html: "<p>text</p>".into(),
                date: "".into(),
                url: None,
                demo: false,
                external_id: Some("entry1".into()),
            }],
            etag: None,
            modified: None,
            generation: 0,
        }
    }
    #[test]
    fn refresh_preserves_facts_and_identity() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Database::open(dir.path().into()).unwrap();
        db.commit_feed(sample()).unwrap();
        let mut l = db.load().unwrap().library;
        l.read = vec!["a".into()];
        l.saved = l.read.clone();
        l.positions.insert("a".into(), 420.);
        db.save(
            UserState {
                read: l.read,
                saved: l.saved,
                positions: l.positions,
                preferences: l.preferences,
                selected_id: Some("a".into()),
            },
            0,
        )
        .unwrap();
        let mut f = sample();
        f.articles[0].id = "different-id".into();
        f.articles[0].title = "Updated".into();
        assert_eq!(db.commit_feed(f).unwrap().new_count, 0);
        drop(db);
        let db = Database::open(dir.path().into()).unwrap();
        let loaded = db.load().unwrap();
        assert_eq!(loaded.library.articles.len(), 1);
        assert_eq!(loaded.library.saved, vec!["a"]);
        assert_eq!(loaded.library.positions["a"], 420.);
        assert!(loaded.library.articles[0].title == "Updated");
    }
    #[test]
    fn stale_writes_and_restore_are_guarded() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Database::open(dir.path().into()).unwrap();
        db.commit_feed(sample()).unwrap();
        let library = db.load().unwrap().library;
        db.import(library.clone(), true).unwrap();
        assert!(db.commit_feed(sample()).is_err());
        assert!(dir
            .path()
            .join("backups")
            .read_dir()
            .unwrap()
            .next()
            .is_some());
        let mut bad = library;
        bad.version = 99;
        assert!(db.import(bad, true).is_err());
        assert_eq!(db.load().unwrap().library.articles.len(), 1);
        let state = UserState {
            read: vec![],
            saved: vec![],
            positions: Default::default(),
            preferences: Library::default().preferences,
            selected_id: None,
        };
        assert!(db.save(state, 0).is_err());
    }
    #[test]
    fn failed_restore_rolls_back_existing_library() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Database::open(dir.path().into()).unwrap();
        db.commit_feed(sample()).unwrap();
        let mut library = db.load().unwrap().library;
        library.articles[0].title = "Replacement".into();
        db.conn.execute_batch("CREATE TEMP TRIGGER fail_restore BEFORE INSERT ON articles BEGIN SELECT RAISE(ABORT,'injected write failure'); END;").unwrap();
        assert!(db.import(library, true).is_err());
        assert_eq!(db.load().unwrap().library.articles[0].title, "One");
        assert_eq!(db.generation().unwrap(), 0);
    }
    #[test]
    fn invalid_stored_preferences_are_reported_without_writing_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Database::open(dir.path().into()).unwrap();
        let broken = r#"{"read":[],"saved":[],"positions":{},"preferences":{"theme":"missing","font":"serif","fontSize":23},"selectedId":null}"#;
        db.conn
            .execute("UPDATE state SET data=?1 WHERE id=1", [broken])
            .unwrap();
        assert!(db.load().is_err());
        assert!(db
            .save(
                UserState {
                    read: vec![],
                    saved: vec![],
                    positions: Default::default(),
                    preferences: serde_json::json!({"theme":"night","font":"serif","fontSize":99}),
                    selected_id: None,
                },
                0
            )
            .is_err());
        let retained: String = db
            .conn
            .query_row("SELECT data FROM state WHERE id=1", [], |row| row.get(0))
            .unwrap();
        assert_eq!(retained, broken);
    }
    #[test]
    fn incomplete_existing_database_is_not_initialized_as_an_empty_library() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.sqlite3");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE retained(value TEXT); INSERT INTO retained VALUES('original');",
        )
        .unwrap();
        drop(conn);
        let original = fs::read(&path).unwrap();
        assert!(Database::open(dir.path().into()).is_err());
        assert_eq!(fs::read(path).unwrap(), original);
    }
    #[test]
    fn source_failures_survive_restart_and_success_clears_them_without_removing_cache() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Database::open(dir.path().into()).unwrap();
        db.commit_feed(sample()).unwrap();
        db.record_feed_failure("s", "HTTP 503").unwrap();
        drop(db);
        let mut db = Database::open(dir.path().into()).unwrap();
        assert_eq!(
            db.load().unwrap().library.sources[0].last_error.as_deref(),
            Some("HTTP 503")
        );
        assert_eq!(db.load().unwrap().library.articles.len(), 1);
        db.commit_feed(sample()).unwrap();
        assert!(db.load().unwrap().library.sources[0].last_error.is_none());
        db.remove_source("s").unwrap();
        assert!(db.load().unwrap().library.sources[0].archived);
        db.commit_feed(sample()).unwrap();
        assert!(db.load().unwrap().library.sources[0].archived);
        db.restore_source("s").unwrap();
        let loaded = db.load().unwrap();
        assert!(!loaded.library.sources[0].archived);
        assert_eq!(loaded.library.articles.len(), 1);
    }
}
