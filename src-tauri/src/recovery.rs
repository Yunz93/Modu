use crate::{db::Database, model::*};
use std::{fs, path::Path};
fn error(e: impl std::fmt::Display) -> String {
    format!("恢复未完成，原阅读库仍有保留：{e}")
}
fn sync_copy(from: &Path, to: &Path) -> Result<(), String> {
    fs::copy(from, to).map_err(error)?;
    fs::File::open(to)
        .and_then(|file| file.sync_all())
        .map_err(error)
}
// Build and validate the replacement before touching the failed database. Preserve raw SQLite sidecars.
pub fn recover(dir: &Path, library: Library) -> Result<Database, String> {
    validate_library(&library)?;
    fs::create_dir_all(dir).map_err(error)?;
    let id = uuid::Uuid::new_v4();
    let staged = dir.join(format!(".restore-{id}"));
    let preserved = dir.join("backups").join(format!("unreadable-{id}"));
    let result = (|| {
        let mut next = Database::open(staged.clone())?;
        next.import(library, true)?;
        next.load()?;
        drop(next);
        fs::File::open(staged.join("library.sqlite3"))
            .and_then(|file| file.sync_all())
            .map_err(error)?;
        fs::create_dir_all(&preserved).map_err(error)?;
        for name in [
            "library.sqlite3",
            "library.sqlite3-wal",
            "library.sqlite3-shm",
        ] {
            let from = dir.join(name);
            if from.exists() {
                sync_copy(&from, &preserved.join(name))?;
            }
        }
        let mut moved = Vec::new();
        let replace = (|| {
            for name in ["library.sqlite3-wal", "library.sqlite3-shm"] {
                let from = dir.join(name);
                if from.exists() {
                    let to = preserved.join(format!("active-{name}"));
                    fs::rename(&from, &to).map_err(error)?;
                    moved.push((from, to));
                }
            }
            fs::rename(staged.join("library.sqlite3"), dir.join("library.sqlite3")).map_err(error)
        })();
        if let Err(reason) = replace {
            for (from, to) in moved.into_iter().rev() {
                let _ = fs::rename(to, from);
            }
            return Err(reason);
        }
        Database::open(dir.to_path_buf())
    })();
    let _ = fs::remove_dir_all(&staged);
    result
}
#[tauri::command]
pub fn recover_library(
    state: tauri::State<crate::AppState>,
    library: Library,
) -> Result<Loaded, String> {
    let mut guard = state.db.lock().map_err(error)?;
    if guard.as_ref().is_ok_and(|db| db.load().is_ok()) {
        return Err("当前阅读库已经可用，请使用阅读库菜单中的备份恢复。".into());
    }
    *guard = Err("正在恢复阅读库。".into());
    let db = match recover(&state.data_dir, library) {
        Ok(db) => db,
        Err(reason) => {
            *guard = Err(reason.clone());
            return Err(reason);
        }
    };
    let loaded = db.load()?;
    *guard = Ok(db);
    state.ready.store(true, std::sync::atomic::Ordering::SeqCst);
    Ok(loaded)
}
#[tauri::command]
pub fn export_library_snapshot(
    state: tauri::State<crate::AppState>,
    snapshot: UserState,
) -> Result<Library, String> {
    crate::with_db(&state, |db| snapshot_from_database(db, snapshot))
}
pub fn snapshot_from_database(db: &Database, snapshot: UserState) -> Result<Library, String> {
    let mut library = db.load()?.library;
    library.read = snapshot.read;
    library.saved = snapshot.saved;
    library.positions = snapshot.positions;
    library.preferences = snapshot.preferences;
    library.selected_id = snapshot.selected_id;
    validate_library(&library)?;
    Ok(library)
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    #[test]
    fn recovers_into_valid_library_and_preserves_original_bytes_and_logs() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("library.sqlite3"), b"broken sqlite bytes").unwrap();
        fs::write(root.path().join("library.sqlite3-wal"), b"original WAL").unwrap();
        let mut library = Library::default();
        library.preferences["fontSize"] = serde_json::json!(25);
        let db = recover(root.path(), library).unwrap();
        assert_eq!(db.load().unwrap().library.preferences["fontSize"], 25);
        let backup = fs::read_dir(root.path().join("backups"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(
            fs::read(backup.join("library.sqlite3")).unwrap(),
            b"broken sqlite bytes"
        );
        assert_eq!(
            fs::read(backup.join("library.sqlite3-wal")).unwrap(),
            b"original WAL"
        );
    }
    #[test]
    fn invalid_backup_does_not_touch_failed_library() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("library.sqlite3");
        fs::write(&path, b"broken").unwrap();
        let mut library = Library::default();
        library.version = 99;
        assert!(recover(root.path(), library).is_err());
        assert_eq!(fs::read(path).unwrap(), b"broken");
    }
    #[test]
    fn failure_to_preserve_raw_files_does_not_replace_original_or_logs() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("library.sqlite3"), b"original").unwrap();
        fs::write(root.path().join("library.sqlite3-wal"), b"original WAL").unwrap();
        fs::write(root.path().join("backups"), b"not a directory").unwrap();
        assert!(recover(root.path(), Library::default()).is_err());
        assert_eq!(
            fs::read(root.path().join("library.sqlite3")).unwrap(),
            b"original"
        );
        assert_eq!(
            fs::read(root.path().join("library.sqlite3-wal")).unwrap(),
            b"original WAL"
        );
    }
    #[test]
    fn full_snapshot_includes_committed_background_content_and_unsaved_reading_facts() {
        let root = tempfile::tempdir().unwrap();
        let mut db = Database::open(root.path().into()).unwrap();
        let fixture: Library =
            serde_json::from_str(include_str!("../../tests/fixtures/demo-backup.json")).unwrap();
        db.import(fixture.clone(), false).unwrap();
        let mut prefs = fixture.preferences.clone();
        prefs["fontSize"] = serde_json::json!(26);
        let snapshot = snapshot_from_database(
            &db,
            UserState {
                read: vec!["local-first".into()],
                saved: vec!["local-first".into()],
                positions: HashMap::from([("local-first".into(), 420.)]),
                preferences: prefs,
                selected_id: Some("local-first".into()),
            },
        )
        .unwrap();
        assert_eq!(snapshot.articles.len(), fixture.articles.len());
        assert_eq!(snapshot.sources.len(), fixture.sources.len());
        assert_eq!(snapshot.preferences["fontSize"], 26);
        assert_eq!(snapshot.saved, vec!["local-first"]);
        assert_eq!(snapshot.positions["local-first"], 420.);
        assert_eq!(snapshot.selected_id.as_deref(), Some("local-first"));
    }
}
