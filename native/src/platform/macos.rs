//! macOS: cursor position, Dock hide, all-workspace visibility.

#[cfg(target_os = "macos")]
pub fn get_cursor_position() -> (i32, i32) {
    use core_graphics::event::CGEvent;
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
    if let Ok(src) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) {
        if let Ok(e) = CGEvent::new(src) {
            let p = e.location();
            return (p.x as i32, p.y as i32);
        }
    }
    (0, 0)
}

#[cfg(target_os = "macos")]
pub fn apply_dev_window_outline(window: &tauri::WebviewWindow) {
    let _ = window.set_shadow(true);
}

pub fn configure(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        use tauri::ActivationPolicy;
        let _ = app.set_activation_policy(ActivationPolicy::Accessory);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_visible_on_all_workspaces(true);
        }
    }
}
