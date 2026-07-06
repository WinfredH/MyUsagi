//! Right-click context menu (port of `menu:open` in main.js).

use crate::prefs::Prefs;
use crate::state::{pet_label, t, SCALES, WindowState};
use std::sync::Arc;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, State, WebviewWindow};

pub fn open_menu(
    app: &AppHandle,
    window: &WebviewWindow,
    state: State<'_, Arc<WindowState>>,
    prefs: State<'_, Arc<parking_lot::Mutex<Prefs>>>,
) -> Result<(), String> {
    let lang = state.lang.lock().clone();
    let scale_name = state.scale_name.lock().clone();
    let follow = state.follow.load(std::sync::atomic::Ordering::Relaxed);
    let wander = state.wander.load(std::sync::atomic::Ordering::Relaxed);
    let on_top = state.on_top.load(std::sync::atomic::Ordering::Relaxed);

    let title = MenuItemBuilder::with_id("title", pet_label(&lang))
        .enabled(false)
        .build(app)
        .map_err(|e| e.to_string())?;

    let zh = CheckMenuItemBuilder::with_id("lang:zh", "中文")
        .checked(lang == "zh")
        .build(app)
        .map_err(|e| e.to_string())?;
    let en = CheckMenuItemBuilder::with_id("lang:en", "English")
        .checked(lang == "en")
        .build(app)
        .map_err(|e| e.to_string())?;
    let ja = CheckMenuItemBuilder::with_id("lang:ja", "日本語")
        .checked(lang == "ja")
        .build(app)
        .map_err(|e| e.to_string())?;
    let lang_sub = SubmenuBuilder::with_id(app, "language", t(&lang, "语言", "Language", "言語"))
        .item(&zh)
        .item(&en)
        .item(&ja)
        .build()
        .map_err(|e| e.to_string())?;

    let follow_item = CheckMenuItemBuilder::with_id(
        "toggle:follow",
        t(&lang, "跟随鼠标", "Follow cursor", "カーソルを追う"),
    )
    .checked(follow)
    .build(app)
    .map_err(|e| e.to_string())?;

    let wander_item = CheckMenuItemBuilder::with_id(
        "toggle:wander",
        t(&lang, "四处走动", "Wander", "うろうろ歩く"),
    )
    .checked(wander)
    .build(app)
    .map_err(|e| e.to_string())?;

    let ontop_item = CheckMenuItemBuilder::with_id(
        "toggle:ontop",
        t(&lang, "总在最前", "Always on top", "常に最前面"),
    )
    .checked(on_top)
    .build(app)
    .map_err(|e| e.to_string())?;

    let audio_on = state.audio_enabled.load(std::sync::atomic::Ordering::Relaxed);
    let audio_item = CheckMenuItemBuilder::with_id(
        "toggle:audio",
        t(&lang, "音频", "Audio", "オーディオ"),
    )
    .checked(audio_on)
    .build(app)
    .map_err(|e| e.to_string())?;

    let mut size_builder =
        SubmenuBuilder::with_id(app, "size", t(&lang, "大小", "Size", "サイズ"));
    for (name, _) in SCALES {
        let label = match *name {
            "small" => t(&lang, "小", "Small", "小"),
            "medium" => t(&lang, "中", "Medium", "中"),
            "large" => t(&lang, "大", "Large", "大"),
            _ => name.to_string(),
        };
        let item = CheckMenuItemBuilder::with_id(format!("scale:{name}"), label)
            .checked(scale_name == *name)
            .build(app)
            .map_err(|e| e.to_string())?;
        size_builder = size_builder.item(&item);
    }
    let size_sub = size_builder.build().map_err(|e| e.to_string())?;

    let hop = MenuItemBuilder::with_id("action:hop", t(&lang, "跳一下", "Hop", "ジャンプ"))
        .build(app)
        .map_err(|e| e.to_string())?;
    let roll = MenuItemBuilder::with_id(
        "action:roll",
        t(&lang, "转手", "Roll hands", "手をぐるぐる"),
    )
    .build(app)
    .map_err(|e| e.to_string())?;
    let dance = MenuItemBuilder::with_id(
        "action:dance",
        t(&lang, "跳舞", "Dance", "ダンス"),
    )
    .build(app)
    .map_err(|e| e.to_string())?;

    let walk_l = MenuItemBuilder::with_id(
        "walk:l",
        t(&lang, "向左走", "Walk left", "左へ歩く"),
    )
    .build(app)
    .map_err(|e| e.to_string())?;
    let walk_r = MenuItemBuilder::with_id(
        "walk:r",
        t(&lang, "向右走", "Walk right", "右へ歩く"),
    )
    .build(app)
    .map_err(|e| e.to_string())?;
    let walk_lu = MenuItemBuilder::with_id(
        "walk:lu",
        t(&lang, "左上走", "Walk up-left", "左上へ"),
    )
    .build(app)
    .map_err(|e| e.to_string())?;
    let walk_ru = MenuItemBuilder::with_id(
        "walk:ru",
        t(&lang, "右上走", "Walk up-right", "右上へ"),
    )
    .build(app)
    .map_err(|e| e.to_string())?;
    let walk_ld = MenuItemBuilder::with_id(
        "walk:ld",
        t(&lang, "左下走", "Walk down-left", "左下へ"),
    )
    .build(app)
    .map_err(|e| e.to_string())?;
    let walk_rd = MenuItemBuilder::with_id(
        "walk:rd",
        t(&lang, "右下走", "Walk down-right", "右下へ"),
    )
    .build(app)
    .map_err(|e| e.to_string())?;
    let walk_sub = SubmenuBuilder::with_id(app, "walk", t(&lang, "走一下", "Walk", "歩く"))
        .item(&walk_l)
        .item(&walk_r)
        .separator()
        .item(&walk_lu)
        .item(&walk_ru)
        .item(&walk_ld)
        .item(&walk_rd)
        .build()
        .map_err(|e| e.to_string())?;

    let quit_label = format!(
        "{} {}",
        t(&lang, "退出", "Quit", "終了"),
        pet_label(&lang)
    );
    let quit = MenuItemBuilder::with_id("quit", quit_label)
        .build(app)
        .map_err(|e| e.to_string())?;

    let menu = MenuBuilder::new(app)
        .item(&title)
        .separator()
        .item(&lang_sub)
        .separator()
        .item(&follow_item)
        .item(&wander_item)
        .item(&ontop_item)
        .item(&audio_item)
        .separator()
        .item(&size_sub)
        .item(&walk_sub)
        .item(&hop)
        .item(&roll)
        .item(&dance)
        .separator()
        .item(&quit)
        .build()
        .map_err(|e| e.to_string())?;

    window
        .popup_menu(&menu)
        .map_err(|e| e.to_string())?;
    let _ = prefs;
    Ok(())
}

pub fn handle_menu_event(
    app: &AppHandle,
    window: &WebviewWindow,
    state: &Arc<WindowState>,
    prefs: &Arc<parking_lot::Mutex<Prefs>>,
    id: &str,
) {
    match id {
        "lang:zh" => {
            let mut p = prefs.lock();
            crate::window::set_lang(app, window, state, "zh", &mut p);
        }
        "lang:en" => {
            let mut p = prefs.lock();
            crate::window::set_lang(app, window, state, "en", &mut p);
        }
        "lang:ja" => {
            let mut p = prefs.lock();
            crate::window::set_lang(app, window, state, "ja", &mut p);
        }
        "toggle:follow" => {
            let on = !state.follow.load(std::sync::atomic::Ordering::Relaxed);
            crate::window::toggle_follow(app, window, state, on);
        }
        "toggle:wander" => {
            let on = !state.wander.load(std::sync::atomic::Ordering::Relaxed);
            crate::window::toggle_wander(app.clone(), window.clone(), state.clone(), on);
        }
        "toggle:ontop" => {
            let on = !state.on_top.load(std::sync::atomic::Ordering::Relaxed);
            crate::window::toggle_on_top(window, state, on);
        }
        "toggle:audio" => {
            let on = !state.audio_enabled.load(std::sync::atomic::Ordering::Relaxed);
            crate::window::toggle_audio(window, state, on);
        }
        s if s.starts_with("scale:") => {
            let name = &s[6..];
            crate::window::set_scale(window, state, name);
        }
        "action:hop" => {
            let _ = window.emit("pet_react", "hop");
        }
        "action:roll" => {
            let _ = window.emit("pet_react", "roll");
        }
        "action:dance" => {
            let _ = window.emit("pet_react", "dance");
        }
        "walk:l" => {
            crate::window::walk_once(app.clone(), window.clone(), state.clone(), -1, 0);
        }
        "walk:r" => {
            crate::window::walk_once(app.clone(), window.clone(), state.clone(), 1, 0);
        }
        "walk:lu" => {
            crate::window::walk_once(app.clone(), window.clone(), state.clone(), -1, -1);
        }
        "walk:ru" => {
            crate::window::walk_once(app.clone(), window.clone(), state.clone(), 1, -1);
        }
        "walk:ld" => {
            crate::window::walk_once(app.clone(), window.clone(), state.clone(), -1, 1);
        }
        "walk:rd" => {
            crate::window::walk_once(app.clone(), window.clone(), state.clone(), 1, 1);
        }
        "quit" => {
            crate::request_app_exit(app);
        }
        _ => {}
    }
}
