mod db;
mod desktop;
mod feed_requests;
mod feeds;
mod migration;
mod model;
mod recovery;
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
    data_dir: std::path::PathBuf,
    window_size: Mutex<Option<desktop::WindowSize>>,
    ready: AtomicBool,
    exiting: AtomicBool,
    updates: updater::Updates,
    feed_requests: feed_requests::FeedRequests,
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
    let loaded = with_db(&state, |db| db.load())?;
    state.ready.store(true, Ordering::SeqCst);
    Ok(loaded)
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
    request_id: Option<String>,
) -> Result<PreparedFeed, String> {
    let generation = with_db(&state, |db| db.generation())?;
    let request = state
        .feed_requests
        .start(request_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()))?;
    let mut cancel = request.cancel.clone();
    if *cancel.borrow() {
        return Err("订阅读取已取消。".into());
    }
    tokio::select! {biased;_=cancel.changed()=>Err("订阅读取已取消。".into()),result=feeds::prepare(url,name,generation)=>result}
}
#[tauri::command]
fn cancel_feed_request(state: tauri::State<AppState>, request_id: String) {
    state.feed_requests.cancel(request_id);
}
#[tauri::command]
fn retry_library(state: tauri::State<AppState>) -> Result<Loaded, String> {
    if state.ready.load(Ordering::SeqCst) {
        return load_library(state);
    }
    let mut guard = state.db.lock().map_err(|_| "阅读库暂不可用。")?;
    *guard = Err("正在重新打开阅读库。".into());
    let db = migration::open_library(
        state.data_dir.clone(),
        std::env::var_os("MODU_DATA_DIR")
            .or_else(|| std::env::var_os("SHIDU_DATA_DIR"))
            .is_none(),
    );
    *guard = db;
    let loaded = guard.as_ref().map_err(Clone::clone)?.load()?;
    state.ready.store(true, Ordering::SeqCst);
    Ok(loaded)
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
    let window_state_file = std::env::var_os("MODU_DATA_DIR")
        .or_else(|| std::env::var_os("SHIDU_DATA_DIR"))
        .map(|dir| {
            std::path::PathBuf::from(dir)
                .join("window-state.json")
                .to_string_lossy()
                .into_owned()
        })
        .unwrap_or_else(|| "window-state.json".into());
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filename(window_state_file)
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .on_menu_event(desktop::handle_menu)
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Resized(_)) {
                desktop::remember_window_size(window);
            }
        })
        .plugin(navigation)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let dir = std::env::var_os("MODU_DATA_DIR")
                .or_else(|| std::env::var_os("SHIDU_DATA_DIR"))
                .map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            let db = migration::open_library(
                dir.clone(),
                std::env::var_os("MODU_DATA_DIR")
                    .or_else(|| std::env::var_os("SHIDU_DATA_DIR"))
                    .is_none(),
            );
            let preferences = db
                .as_ref()
                .map(|db| db.stored_preferences())
                .unwrap_or_default();
            let theme = desktop::theme_name(&preferences);
            let locale = preferences["locale"].as_str().unwrap_or("zh-CN");
            app.manage(AppState {
                db: Mutex::new(db),
                data_dir: dir,
                window_size: Mutex::new(None),
                ready: AtomicBool::new(false),
                exiting: AtomicBool::new(false),
                updates: updater::Updates::default(),
                feed_requests: feed_requests::FeedRequests::default(),
            });
            desktop::create_main_window(app, theme, locale)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_library,
            retry_library,
            cancel_feed_request,
            save_state,
            prepare_feed,
            commit_feed,
            import_library,
            frontend_ready,
            finish_exit,
            open_external,
            import_file,
            export_file,
            updater::app_update_status,
            updater::check_app_update,
            updater::download_app_update,
            updater::cancel_app_update,
            updater::install_app_update,
            desktop::list_system_fonts,
            desktop::set_app_appearance,
            desktop::set_app_locale,
            desktop::record_feed_failure,
            desktop::set_subscription_archived,
            recovery::recover_library,
            recovery::export_library_snapshot
        ])
        .build(tauri::generate_context!())
        .expect("无法启动墨牍");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
            desktop::persist_window_size(app);
        }
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
