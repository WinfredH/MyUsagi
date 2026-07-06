mod macos;
mod windows;

#[cfg(target_os = "macos")]
pub use macos::get_cursor_position;
#[cfg(windows)]
pub use windows::get_cursor_position;
#[cfg(not(any(target_os = "macos", windows)))]
pub fn get_cursor_position() -> (i32, i32) {
    (0, 0)
}

pub fn configure_app(app: &tauri::AppHandle) {
    macos::configure(app);
    windows::configure(app);
}

/// Debug builds only: draw a native (OS-level) outline around the pet window.
pub fn apply_dev_window_outline(window: &tauri::WebviewWindow) {
    #[cfg(windows)]
    windows::apply_dev_window_outline(window);
    #[cfg(target_os = "macos")]
    macos::apply_dev_window_outline(window);
}
