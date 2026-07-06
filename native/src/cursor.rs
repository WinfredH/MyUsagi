//! Global cursor polling — look-at + hit-pass (Windows click-through fix).

use crate::platform;
use crate::state::WindowState;
use serde::Serialize;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, WebviewWindow};

#[derive(Clone, Serialize)]
pub struct LookPayload {
    pub dx: f64,
    pub dy: f64,
}

/// Viewport-relative cursor position (matches DOM `clientX` / `clientY`).
#[derive(Clone, Serialize)]
pub struct CursorMovePayload {
    pub x: f64,
    pub y: f64,
}

pub fn client_cursor(window: &WebviewWindow) -> Option<(f64, f64)> {
    let (sx, sy) = platform::get_cursor_position();
    let outer = window.outer_position().ok()?;
    let scale = window.scale_factor().ok()?;
    let x = (sx as f64 - outer.x as f64) / scale;
    let y = (sy as f64 - outer.y as f64) / scale;
    Some((x, y))
}

/// Poll the OS cursor and push viewport coords to the renderer.
///
/// On Windows, `set_ignore_cursor_events(true)` stops WebView mouse delivery, so the
/// renderer cannot use `mousemove` to toggle pass-through (Electron's forward:true
/// has no Tauri equivalent). Rust polls globally instead.
pub fn start_hit_pass(window: WebviewWindow) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(40)).await;
            if let Some((x, y)) = client_cursor(&window) {
                let _ = window.emit("cursor_move", CursorMovePayload { x, y });
            }
        }
    });
}

pub fn start_look(app: AppHandle, window: WebviewWindow, state: Arc<WindowState>) {
    let cancel = Arc::new(std::sync::atomic::AtomicBool::new(false));
    *state.look_cancel.lock() = Some(cancel.clone());

    tauri::async_runtime::spawn(async move {
        let mut last_dx = 0.0f64;
        let mut last_dy = 0.0f64;
        loop {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(80)).await;
            if !state.follow.load(Ordering::Relaxed) || state.dragging.load(Ordering::Relaxed) {
                continue;
            }
            let (cx, cy) = platform::get_cursor_position();
            let Ok(outer) = window.outer_position() else {
                continue;
            };
            let Ok(size) = window.outer_size() else {
                continue;
            };
            let wx = outer.x + size.width as i32 / 2;
            let wy = outer.y + (size.height as f32 * 0.42) as i32;
            let dx = ((cx - wx) as f64 / 360.0).clamp(-1.0, 1.0);
            let dy = ((cy - wy) as f64 / 360.0).clamp(-1.0, 1.0);
            if (dx - last_dx).abs() > 0.03 || (dy - last_dy).abs() > 0.03 {
                last_dx = dx;
                last_dy = dy;
                let _ = window.emit("pet_look", LookPayload { dx, dy });
            }
        }
        let _ = app;
    });
}

pub fn stop_look(state: &WindowState) {
    if let Some(c) = state.look_cancel.lock().take() {
        c.store(true, Ordering::Relaxed);
    }
}
