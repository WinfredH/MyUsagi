//! Window fit, drag, wander / walk timers.

use crate::cursor;
use crate::platform;
use crate::state::{USAGI_WALK_SPEED, WindowState};
use serde::Serialize;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, PhysicalPosition, WebviewWindow};
use tauri::window::Color;

#[derive(Clone, Serialize)]
pub struct WalkPayload {
    pub dir: i32,
    /// Vertical walk component: -1 = up, 0 = horizontal, 1 = down.
    pub dy: i32,
}

pub fn init_window(window: &WebviewWindow, state: &WindowState) {
    let _ = window.set_skip_taskbar(true);
    apply_on_top(window, state);
    // Windows: shadow=true on undecorated windows draws a 1px white border (Electron: hasShadow: false).
    let _ = window.set_shadow(false);
    // WebView2 default is white; alpha must be 0 for a transparent webview on Windows 8+.
    let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
    let _ = window.set_ignore_cursor_events(true);

    #[cfg(debug_assertions)]
    platform::apply_dev_window_outline(window);
}

pub fn apply_on_top(window: &WebviewWindow, state: &WindowState) {
    let on = state.on_top.load(Ordering::Relaxed);
    let _ = window.set_always_on_top(on);
}

pub fn fit_window(window: &WebviewWindow, state: &WindowState, w: i32, h: i32) {
    let w = w.max(60);
    let h = h.max(60);
    let cur = window.outer_position().ok();
    let cur_size = window.outer_size().ok();
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    let (mut x, mut y) = if let (Some(cur), Some(cur_size), Some(mon)) = (cur, cur_size, monitor) {
        let area = mon.work_area();
        let scale = mon.scale_factor();
        let area_x = (area.position.x as f64 / scale) as i32;
        let area_y = (area.position.y as f64 / scale) as i32;
        let area_w = (area.size.width as f64 / scale) as i32;
        let area_h = (area.size.height as f64 / scale) as i32;
        if !state.placed.swap(true, Ordering::Relaxed) {
            (area_x + area_w - w - 24, area_y + area_h - h - 12)
        } else {
            let cx = cur.x + cur_size.width as i32 / 2;
            let bottom = cur.y + cur_size.height as i32;
            (cx - w / 2, bottom - h)
        }
    } else {
        (100, 100)
    };

    if let Some(mon) = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
    {
        let area = mon.work_area();
        let scale = mon.scale_factor();
        let area_x = (area.position.x as f64 / scale) as i32;
        let area_y = (area.position.y as f64 / scale) as i32;
        let area_w = (area.size.width as f64 / scale) as i32;
        let area_h = (area.size.height as f64 / scale) as i32;
        x = x.clamp(area_x, area_x + area_w - w);
        y = y.clamp(area_y, area_y + area_h - h);
    }

    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: w as f64,
        height: h as f64,
    }));
    let _ = window.set_position(tauri::Position::Physical(PhysicalPosition { x, y }));
    if !window.is_visible().unwrap_or(false) {
        let _ = window.show();
    }
}

pub fn drag_start(state: &WindowState, x: i32, y: i32, window: &WebviewWindow) {
    state.dragging.store(true, Ordering::Relaxed);
    *state.drag_anchor.lock() = (x, y);
    if let Ok(pos) = window.outer_position() {
        *state.win_start.lock() = (pos.x, pos.y);
    }
    stop_walk(state);
}

pub fn drag_move(state: &WindowState, x: i32, y: i32, window: &WebviewWindow) {
    if !state.dragging.load(Ordering::Relaxed) {
        return;
    }
    let (ax, ay) = *state.drag_anchor.lock();
    let (sx, sy) = *state.win_start.lock();
    let _ = window.set_position(tauri::Position::Physical(PhysicalPosition {
        x: sx + x - ax,
        y: sy + y - ay,
    }));
}

pub fn drag_end(state: &WindowState) {
    state.dragging.store(false, Ordering::Relaxed);
}

pub fn stop_walk(state: &WindowState) {
    state.walk_active.store(false, Ordering::Relaxed);
    if let Some(c) = state.walk_cancel.lock().take() {
        c.store(true, Ordering::Relaxed);
    }
}

pub fn schedule_walk(app: AppHandle, window: WebviewWindow, state: Arc<WindowState>) {
    if !state.wander.load(Ordering::Relaxed) && !state.follow.load(Ordering::Relaxed) {
        return;
    }
    let delay_ms = 6000 + rand::random::<u64>() % 9000;
    let s = state.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        if s.wander.load(Ordering::Relaxed) || s.follow.load(Ordering::Relaxed) {
            start_walk(app, window, s).await;
        }
    });
}

/// Decide the next walk segment. When `follow` is on and the cursor is not over
/// the character, walk toward the cursor (a random distance in that direction,
/// not all the way); otherwise pick a random direction. After reaching the
/// cursor the next segment is random, so the pet alternates: toward-cursor →
/// random → toward-cursor → …
async fn start_walk(app: AppHandle, window: WebviewWindow, state: Arc<WindowState>) {
    if state.dragging.load(Ordering::Relaxed)
        || !(state.wander.load(Ordering::Relaxed) || state.follow.load(Ordering::Relaxed))
    {
        schedule_walk(app.clone(), window.clone(), state);
        return;
    }

    let (dir, dy) = if state.follow.load(Ordering::Relaxed) {
        let (cx, cy) = platform::get_cursor_position();
        if let (Ok(outer), Ok(size)) = (window.outer_position(), window.outer_size()) {
            let win_right = outer.x + size.width as i32;
            let win_bottom = outer.y + size.height as i32;
            let on_character =
                cx >= outer.x && cx <= win_right && cy >= outer.y && cy <= win_bottom;
            if !on_character {
                // Walk toward the cursor: dir/dy from the sign of the delta
                // between cursor and the character's center. The actual
                // distance is randomized by `walk_in_dir`.
                let pet_cx = outer.x + size.width as i32 / 2;
                let pet_cy = outer.y + size.height as i32 / 2;
                let dx = cx - pet_cx;
                let dy = cy - pet_cy;
                let dir = if dx < 0 { -1 } else { 1 };
                let dy = if dy.abs() < 40 { 0 } else if dy < 0 { -1 } else { 1 };
                (dir, dy)
            } else {
                random_walk_dir()
            }
        } else {
            random_walk_dir()
        }
    } else {
        random_walk_dir()
    };
    walk_in_dir(app, window, state, dir, dy).await;
}

/// Wander picks uniformly among the six directions: two horizontal plus
/// four 45° diagonals.
fn random_walk_dir() -> (i32, i32) {
    let r: u8 = rand::random::<u8>() % 6;
    match r {
        0 => (-1, 0),
        1 => (1, 0),
        2 => (-1, -1),
        3 => (1, -1),
        4 => (-1, 1),
        _ => (1, 1),
    }
}

/// Drive a single walk segment in the given direction. `dir` is the horizontal
/// sign (-1 / 1) and `dy` is the vertical sign (-1 up / 0 horizontal / 1 down).
/// The walk distance is randomized; edges bounce. Emits `pet_walk`, runs the
/// position loop, then re-arms `schedule_walk`.
async fn walk_in_dir(
    app: AppHandle,
    window: WebviewWindow,
    state: Arc<WindowState>,
    dir_in: i32,
    dy_in: i32,
) {
    let Ok(cur) = window.outer_position() else {
        schedule_walk(app, window, state);
        return;
    };
    let Ok(size) = window.outer_size() else {
        schedule_walk(app, window, state);
        return;
    };
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(mon) = monitor else {
        schedule_walk(app, window, state);
        return;
    };
    let area = mon.work_area();
    let scale = mon.scale_factor();
    let area_x = (area.position.x as f64 / scale) as i32;
    let area_y = (area.position.y as f64 / scale) as i32;
    let area_w = (area.size.width as f64 / scale) as i32;
    let area_h = (area.size.height as f64 / scale) as i32;
    let b_x = cur.x;
    let b_y = cur.y;
    let b_w = size.width as i32;
    let b_h = size.height as i32;

    let room_left = b_x - area_x;
    let room_right = (area_x + area_w - b_w) - b_x;
    let room_up = b_y - area_y;
    let room_down = (area_y + area_h - b_h) - b_y;

    let mut dir: i32 = dir_in;
    let mut dy: i32 = dy_in;
    if dir == 1 && room_right < 60 {
        dir = -1;
    } else if dir == -1 && room_left < 60 {
        dir = 1;
    }
    if dy == -1 && room_up < 60 {
        dy = if room_down >= 60 { 1 } else { 0 };
    } else if dy == 1 && room_down < 60 {
        dy = if room_up >= 60 { -1 } else { 0 };
    }

    let distance_x = 80 + (rand::random::<u64>() % 220) as i32;
    let distance_y = if dy == 0 { 0 } else { 60 + (rand::random::<u64>() % 160) as i32 };
    let mut target_x = b_x + dir * distance_x;
    let mut target_y = b_y + dy * distance_y;
    target_x = target_x.clamp(area_x, area_x + area_w - b_w);
    target_y = target_y.clamp(area_y, area_y + area_h - b_h);
    let real_dir: i32 = if target_x >= b_x { 1 } else { -1 };
    let real_dy: i32 = if target_y == b_y {
        0
    } else if target_y > b_y {
        1
    } else {
        -1
    };

    let _ = window.emit(
        "pet_walk",
        WalkPayload {
            dir: real_dir,
            dy: real_dy,
        },
    );

    let speed = USAGI_WALK_SPEED;
    // For 45° walks, split the speed across both axes so the diagonal covers
    // the same per-axis distance as a horizontal walk (≈ speed / √2).
    let axis_speed = if real_dy != 0 {
        ((speed as f64) / std::f64::consts::SQRT_2).round().max(1.0) as i32
    } else {
        speed
    };
    let cancel = Arc::new(std::sync::atomic::AtomicBool::new(false));
    *state.walk_cancel.lock() = Some(cancel.clone());
    state.walk_active.store(true, Ordering::Relaxed);
    let win = window.clone();
    let st = state.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            if cancel.load(Ordering::Relaxed) || st.dragging.load(Ordering::Relaxed) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(16)).await;
            let Ok(pos) = win.outer_position() else {
                break;
            };
            let remaining_x = target_x - pos.x;
            let remaining_y = target_y - pos.y;
            let done_x = remaining_x.abs() <= axis_speed;
            let done_y = remaining_y.abs() <= axis_speed;
            if done_x && done_y {
                break;
            }
            let step_x = if done_x { 0 } else { remaining_x.signum() * axis_speed };
            let step_y = if done_y { 0 } else { remaining_y.signum() * axis_speed };
            let _ = win.set_position(tauri::Position::Physical(PhysicalPosition {
                x: pos.x + step_x,
                y: pos.y + step_y,
            }));
        }
        st.walk_active.store(false, Ordering::Relaxed);
        let _ = win.emit("pet_walk_stop", ());
        schedule_walk(app, win, st);
    });
}

/// Public entry point for menu-triggered one-shot walks in any of the six
/// supported directions (horizontal + 45° diagonals). Independent of the
/// `wander` toggle; re-arms normal scheduling after the segment completes.
pub fn walk_once(app: AppHandle, window: WebviewWindow, state: Arc<WindowState>, dir: i32, dy: i32) {
    stop_walk(&state);
    let _ = window.emit("pet_walk_stop", ());
    let app_c = app.clone();
    let win_c = window.clone();
    let st = state.clone();
    tauri::async_runtime::spawn(async move {
        if st.dragging.load(Ordering::Relaxed) {
            schedule_walk(app_c, win_c, st);
            return;
        }
        walk_in_dir(app_c, win_c, st, dir, dy).await;
    });
}

pub fn emit_follow_enabled(window: &WebviewWindow, state: &WindowState) {
    let _ = window.emit(
        "follow_enabled",
        state.follow.load(Ordering::Relaxed),
    );
}

pub fn start_behaviors(app: AppHandle, window: WebviewWindow, state: Arc<WindowState>) {
    cursor::start_hit_pass(window.clone());
    emit_follow_enabled(&window, &state);
    if state.follow.load(Ordering::Relaxed) {
        cursor::start_look(app.clone(), window.clone(), state.clone());
    }
    schedule_walk(app, window, state);
}

pub fn toggle_follow(app: &AppHandle, window: &WebviewWindow, state: &Arc<WindowState>, on: bool) {
    state.follow.store(on, Ordering::Relaxed);
    emit_follow_enabled(window, state);
    if on {
        cursor::start_look(app.clone(), window.clone(), state.clone());
        // Follow drives walking on its own; arm a walk if none is active.
        if !state.walk_active.load(Ordering::Relaxed) {
            schedule_walk(app.clone(), window.clone(), state.clone());
        }
    } else {
        cursor::stop_look(state);
        // If wander is also off, stop any in-flight walk.
        if !state.wander.load(Ordering::Relaxed) {
            stop_walk(state);
            let _ = window.emit("pet_walk_stop", ());
        }
    }
}

pub fn toggle_wander(app: AppHandle, window: WebviewWindow, state: Arc<WindowState>, on: bool) {
    state.wander.store(on, Ordering::Relaxed);
    if on {
        if !state.walk_active.load(Ordering::Relaxed) {
            schedule_walk(app, window, state);
        }
    } else if !state.follow.load(Ordering::Relaxed) {
        // Only stop walking when follow isn't driving it.
        stop_walk(&state);
        let _ = window.emit("pet_walk_stop", ());
    }
}

pub fn toggle_on_top(window: &WebviewWindow, state: &WindowState, on: bool) {
    state.on_top.store(on, Ordering::Relaxed);
    apply_on_top(window, state);
}

pub fn toggle_audio(window: &WebviewWindow, state: &WindowState, on: bool) {
    state.audio_enabled.store(on, Ordering::Relaxed);
    let _ = window.emit("audio_enabled", on);
}

pub fn set_lang(
    app: &AppHandle,
    window: &WebviewWindow,
    state: &WindowState,
    l: &str,
    prefs: &mut crate::prefs::Prefs,
) {
    let lang = if crate::state::LANGS.contains(&l) {
        l.to_string()
    } else {
        "zh".to_string()
    };
    if *state.lang.lock() == lang {
        return;
    }
    *state.lang.lock() = lang.clone();
    prefs.lang = Some(lang.clone());
    crate::prefs::save(app, prefs);
    let _ = window.emit("pet_lang", lang);
}

pub fn set_scale(window: &WebviewWindow, state: &WindowState, name: &str) {
    if let Some((_, h)) = crate::state::SCALES.iter().find(|(n, _)| *n == name) {
        *state.scale_name.lock() = name.to_string();
        let _ = window.emit("scale_set", *h);
    }
}
