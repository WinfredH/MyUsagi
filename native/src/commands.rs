//! Tauri commands — replaces Electron preload IPC bridge.

use crate::state::{AssetStore, WindowState};
use crate::window;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, State, WebviewWindow};

#[tauri::command]
pub fn get_asset_bundle(assets: State<'_, AssetStore>) -> HashMap<String, String> {
    assets.0.clone()
}

#[tauri::command]
pub fn fit_window(
    w: i32,
    h: i32,
    window: WebviewWindow,
    state: State<'_, Arc<WindowState>>,
) -> Result<(), String> {
    window::fit_window(&window, &state, w, h);
    Ok(())
}

#[tauri::command]
pub fn drag_start(
    x: i32,
    y: i32,
    window: WebviewWindow,
    state: State<'_, Arc<WindowState>>,
) -> Result<(), String> {
    window::drag_start(&state, x, y, &window);
    Ok(())
}

#[tauri::command]
pub fn drag_move(
    x: i32,
    y: i32,
    window: WebviewWindow,
    state: State<'_, Arc<WindowState>>,
) -> Result<(), String> {
    window::drag_move(&state, x, y, &window);
    Ok(())
}

#[tauri::command]
pub fn drag_end(state: State<'_, Arc<WindowState>>) -> Result<(), String> {
    window::drag_end(&state);
    Ok(())
}

#[tauri::command]
pub fn set_ignore_cursor(ignore: bool, window: WebviewWindow) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_menu(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Arc<WindowState>>,
    prefs: State<'_, Arc<parking_lot::Mutex<crate::prefs::Prefs>>>,
) -> Result<(), String> {
    crate::menu::open_menu(&app, &window, state, prefs)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    crate::request_app_exit(&app);
    Ok(())
}
