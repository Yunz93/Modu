mod db;
mod feeds;
mod migration;
mod model;
pub mod update_signature;
mod updater;
use db::Database;
use model::*;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager};
struct AppState {
    db: Mutex<Result<Database, String>>,
    ready: AtomicBool,
    exiting: AtomicBool,
    updates: updater::Updates,
}
fn with_db<T>(
    state: &AppState,
    action: impl FnOnce(&mut Database) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state
        .db
        .lock()
        .map_err(|_| "阅读库暂不可用，请重新打开。".to_string())?;
    if state.updates.installing.load(Ordering::SeqCst) {
        return Err("正在安装更新，请稍候。".into());
    }
    match guard.as_mut() {
        Ok(db) => action(db),
        Err(reason) => Err(reason.clone()),
    }
}
#[tauri::command]
fn load_library(state: tauri::State<AppState>) -> Result<Loaded, String> {
    with_db(&state, |db| db.load())
}
#[tauri::command]
fn save_state(
    state: tauri::State<AppState>,
    snapshot: UserState,
    revision: i64,
) -> Result<i64, String> {
    with_db(&state, |db| db.save(snapshot, revision))
}
#[tauri::command]
async fn prepare_feed(
    state: tauri::State<'_, AppState>,
    url: String,
    name: String,
) -> Result<PreparedFeed, String> {
    let generation = with_db(&state, |db| db.generation())?;
    feeds::prepare(url, name, generation).await
}
#[tauri::command]
fn commit_feed(state: tauri::State<AppState>, feed: PreparedFeed) -> Result<Changes, String> {
    with_db(&state, |db| db.commit_feed(feed))
}
#[tauri::command]
fn import_library(
    state: tauri::State<AppState>,
    library: Library,
    replace: bool,
) -> Result<Loaded, String> {
    with_db(&state, |db| db.import(library, replace))
}
#[tauri::command]
fn unsubscribe(state: tauri::State<AppState>, id: String) -> Result<Loaded, String> {
    with_db(&state, |db| db.remove_source(&id))
}
#[tauri::command]
fn frontend_ready(state: tauri::State<AppState>) {
    state.ready.store(true, Ordering::SeqCst);
}
#[tauri::command]
fn finish_exit(app: tauri::AppHandle, state: tauri::State<AppState>) {
    if state.updates.installing.load(Ordering::SeqCst) {
        return;
    }
    state.exiting.store(true, Ordering::SeqCst);
    app.exit(0);
}
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let url = feeds::safe_url(&url)?;
    open::that(url.as_str()).map_err(|_| "无法打开默认浏览器。".into())
}
#[derive(serde::Serialize)]
struct ImportedFile {
    name: String,
    contents: String,
}
#[tauri::command]
async fn import_file(backup: bool) -> Result<Option<ImportedFile>, String> {
    let extensions = if backup {
        vec!["json"]
    } else {
        vec!["xml", "rss", "atom", "opml"]
    };
    let file = rfd::AsyncFileDialog::new()
        .set_title(if backup {
            "选择墨牍备份"
        } else {
            "导入订阅文件"
        })
        .add_filter("订阅与备份", &extensions)
        .pick_file()
        .await;
    let Some(file) = file else { return Ok(None) };
    let size = std::fs::metadata(file.path())
        .map_err(|_| "无法读取文件。")?
        .len();
    if size > 128 * 1024 * 1024 {
        return Err("文件超过 128 MB，未读取。".into());
    }
    let contents =
        std::fs::read_to_string(file.path()).map_err(|_| "文件不是有效的 UTF-8 文本。")?;
    Ok(Some(ImportedFile {
        name: file.file_name(),
        contents,
    }))
}
#[tauri::command]
async fn export_file(name: String, contents: String, extension: String) -> Result<bool, String> {
    if contents.len() > 128 * 1024 * 1024 {
        return Err("备份超过 128 MB，未写入。".into());
    }
    let extension = if extension == "opml" { "opml" } else { "json" };
    let file = rfd::AsyncFileDialog::new()
        .set_title("导出墨牍阅读库")
        .set_file_name(name)
        .add_filter("阅读库", &[extension])
        .save_file()
        .await;
    let Some(file) = file else { return Ok(false) };
    // Write beside the destination and rename only after a complete write.
    let tmp = file.path().with_extension(format!("{extension}.shidu-tmp"));
    let mut output = std::fs::File::create(&tmp).map_err(|_| "无法创建备份文件。")?;
    use std::io::Write;
    output
        .write_all(contents.as_bytes())
        .and_then(|_| output.sync_all())
        .map_err(|_| "备份写入失败，目标文件未替换。")?;
    std::fs::rename(tmp, file.path()).map_err(|_| "无法保存备份，请换一个位置。")?;
    Ok(true)
}
pub fn run() {
    let navigation = tauri::plugin::Builder::<tauri::Wry>::new("navigation")
        .on_navigation(|_, url| {
            url.scheme() == "tauri"
                || url.host_str() == Some("tauri.localhost")
                || (cfg!(debug_assertions)
                    && url.host_str() == Some("localhost")
                    && url.port() == Some(1420))
        })
        .build();
    let app = tauri::Builder::default()
        .plugin(navigation)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let dir = std::env::var_os("MODU_DATA_DIR")
                .or_else(|| std::env::var_os("SHIDU_DATA_DIR"))
                .map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            app.manage(AppState {
                db: Mutex::new(migration::open_library(
                    dir,
                    std::env::var_os("MODU_DATA_DIR")
                        .or_else(|| std::env::var_os("SHIDU_DATA_DIR"))
                        .is_none(),
                )),
                ready: AtomicBool::new(false),
                exiting: AtomicBool::new(false),
                updates: updater::Updates::default(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_library,
            save_state,
            prepare_feed,
            commit_feed,
            import_library,
            unsubscribe,
            frontend_ready,
            finish_exit,
            open_external,
            import_file,
            export_file,
            updater::app_update_status,
            updater::check_app_update,
            updater::download_app_update,
            updater::cancel_app_update,
            updater::install_app_update
        ])
        .build(tauri::generate_context!())
        .expect("无法启动墨牍");
    app.run(|app, event| {
        let state = app.state::<AppState>();
        let must_save = state.ready.load(Ordering::SeqCst) && !state.exiting.load(Ordering::SeqCst);
        match event {
            tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } if must_save => {
                api.prevent_close();
                if !state.updates.installing.load(Ordering::SeqCst) {
                    let _ = app.emit("shidu://request-exit", ());
                }
            }
            tauri::RunEvent::ExitRequested { api, .. } if must_save => {
                api.prevent_exit();
                if !state.updates.installing.load(Ordering::SeqCst) {
                    let _ = app.emit("shidu://request-exit", ());
                }
            }
            _ => {}
        }
    });
}
