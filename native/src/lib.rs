pub mod commands;
pub mod cursor;
pub mod menu;
pub mod pack;
pub mod platform;
pub mod prefs;
pub mod state;
pub mod vault;
pub mod window;

use prefs::Prefs;
use state::{AssetStore, LaunchConfig, WindowState, LANGS, SCALES};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Exit from menu/commands without blocking the main thread event loop.
pub fn request_app_exit(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        app.exit(0);
    });
}

pub fn resolve_launch(cli_size: Option<String>, prefs: &Prefs) -> LaunchConfig {
    let scale_name = cli_size
        .filter(|s| SCALES.iter().any(|(n, _)| n == s))
        .unwrap_or_else(|| "medium".to_string());

    let lang = prefs
        .lang
        .clone()
        .filter(|l| LANGS.contains(&l.as_str()))
        .unwrap_or_else(|| "zh".to_string());

    LaunchConfig {
        scale_name,
        lang,
    }
}

pub fn run_app(launch: LaunchConfig) -> Result<(), String> {
    let launch_for_setup = launch.clone();
    let state = Arc::new(WindowState::new(launch));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state.clone())
        .setup(move |app| {
            let assets = pack::load_assets_for_app(app.handle());
            app.manage(AssetStore(assets));

            let prefs_data = prefs::load(app.handle());
            let prefs = Arc::new(parking_lot::Mutex::new(prefs_data));

            let window = app
                .get_webview_window("main")
                .expect("main window missing");

            window::init_window(&window, &state);

            let url = format!(
                "index.html?scale={}&lang={}",
                launch_for_setup.scale_name, launch_for_setup.lang
            );
            if let Ok(parsed) = tauri::Url::parse(&url) {
                let _ = window.navigate(parsed);
            }

            platform::configure_app(app.handle());

            let app_handle = app.handle().clone();
            let win = window.clone();
            let st = state.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(800)).await;
                window::start_behaviors(app_handle, win, st);
            });

            app.manage(prefs.clone());

            let menu_state = state.clone();
            let menu_prefs = prefs.clone();
            let app_for_menu = app.handle().clone();
            let win_for_menu = window.clone();
            window.on_menu_event(move |_win, event| {
                menu::handle_menu_event(
                    &app_for_menu,
                    &win_for_menu,
                    &menu_state,
                    &menu_prefs,
                    event.id().as_ref(),
                );
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_asset_bundle,
            commands::fit_window,
            commands::drag_start,
            commands::drag_move,
            commands::drag_end,
            commands::set_ignore_cursor,
            commands::open_menu,
            commands::quit_app,
        ])
        .build(tauri::generate_context!())
        .map_err(|e| e.to_string())?
        .run(|_app, _event| {});

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prefs::Prefs;

    #[test]
    fn resolve_launch_cli_size_override() {
        let prefs = Prefs::default();
        let launch = resolve_launch(Some("large".into()), &prefs);
        assert_eq!(launch.scale_name, "large");
        assert_eq!(launch.lang, "zh");
    }

    #[test]
    fn resolve_launch_invalid_size_defaults_medium() {
        let prefs = Prefs {
            lang: Some("en".into()),
        };
        let launch = resolve_launch(Some("huge".into()), &prefs);
        assert_eq!(launch.scale_name, "medium");
        assert_eq!(launch.lang, "en");
    }

    #[test]
    fn resolve_launch_invalid_lang_defaults_zh() {
        let prefs = Prefs {
            lang: Some("fr".into()),
        };
        let launch = resolve_launch(None, &prefs);
        assert_eq!(launch.lang, "zh");
    }
}
