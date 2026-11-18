use crate::db::Database;
use std::path::{Path, PathBuf};
// Copy a consistent SQLite snapshot, including committed WAL pages. Never change the legacy library.
pub fn migrate_legacy(from: &Path, to: &Path) -> Result<(), String> {
    if to.join("library.sqlite3").exists() || !from.join("library.sqlite3").is_file() {
        return Ok(());
    }
    std::fs::create_dir_all(to).map_err(|e| format!("无法准备墨牍阅读库：{e}"))?;
    let temporary = to.join("library-migration.tmp");
    if temporary.exists() {
        std::fs::remove_file(&temporary).map_err(|e| format!("无法清理未完成迁移：{e}"))?;
    }
    let old = rusqlite::Connection::open_with_flags(
        from.join("library.sqlite3"),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| format!("无法读取原拾读阅读库：{e}"))?;
    // Confirm the source before creating the new writable library.
    old.query_row("SELECT revision FROM state WHERE id=1", [], |r| {
        r.get::<_, i64>(0)
    })
    .map_err(|e| format!("原阅读库暂不可用，已停止迁移：{e}"))?;
    old.backup("main", &temporary, None)
        .map_err(|e| format!("阅读库迁移失败，原数据仍保留：{e}"))?;
    std::fs::rename(&temporary, to.join("library.sqlite3"))
        .map_err(|e| format!("无法完成阅读库迁移，原数据仍保留：{e}"))?;
    Ok(())
}
pub fn open_library(dir: PathBuf, migrate: bool) -> Result<Database, String> {
    if migrate {
        if let Some(parent) = dir.parent() {
            migrate_legacy(&parent.join("com.yunz.shidu"), &dir)?;
        }
    }
    Database::open(dir)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_keeps_latest_wal_and_never_overwrites_new_library() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join("old");
        let new = root.path().join("new");
        let source = Database::open(old.clone()).unwrap();
        let conn = rusqlite::Connection::open(old.join("library.sqlite3")).unwrap();
        conn.execute("UPDATE state SET revision=7", []).unwrap();
        migrate_legacy(&old, &new).unwrap();
        assert_eq!(
            Database::open(new.clone())
                .unwrap()
                .load()
                .unwrap()
                .revision,
            7
        );
        conn.execute("UPDATE state SET revision=8", []).unwrap();
        migrate_legacy(&old, &new).unwrap();
        assert_eq!(Database::open(new).unwrap().load().unwrap().revision, 7);
        assert_eq!(source.load().unwrap().revision, 8);
    }
    #[test]
    fn broken_legacy_is_not_replaced_by_empty_data() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join("old");
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("library.sqlite3"), b"broken").unwrap();
        let new = root.path().join("new");
        assert!(migrate_legacy(&old, &new).is_err());
        assert!(!new.join("library.sqlite3").exists());
    }
}
