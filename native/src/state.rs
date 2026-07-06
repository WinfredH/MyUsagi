//! Shared application state (window drag, walk, look, settings).

use parking_lot::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

pub const USAGI_WALK_SPEED: i32 = 3;
pub const LANGS: &[&str] = &["zh", "en", "ja"];
pub const SCALES: &[(&str, u32)] = &[("small", 150), ("medium", 200), ("large", 270)];

pub fn pet_label(lang: &str) -> String {
    match lang {
        "en" => "Usagi".to_string(),
        "ja" => "うさぎ".to_string(),
        _ => "乌萨奇".to_string(),
    }
}

pub fn t(lang: &str, zh: &str, en: &str, ja: &str) -> String {
    match lang {
        "en" => en.to_string(),
        "ja" => ja.to_string(),
        _ => zh.to_string(),
    }
}

#[derive(Clone, Debug)]
pub struct LaunchConfig {
    pub scale_name: String,
    pub lang: String,
}

pub struct WindowState {
    pub launch: Mutex<LaunchConfig>,
    pub lang: Mutex<String>,
    pub scale_name: Mutex<String>,
    pub follow: AtomicBool,
    pub wander: AtomicBool,
    pub on_top: AtomicBool,
    pub audio_enabled: AtomicBool,
    pub dragging: AtomicBool,
    pub placed: AtomicBool,
    pub drag_anchor: Mutex<(i32, i32)>,
    pub win_start: Mutex<(i32, i32)>,
    pub walk_active: AtomicBool,
    pub walk_cancel: Mutex<Option<Arc<AtomicBool>>>,
    pub look_cancel: Mutex<Option<Arc<AtomicBool>>>,
}

impl WindowState {
    pub fn new(launch: LaunchConfig) -> Self {
        let lang = launch.lang.clone();
        let scale = launch.scale_name.clone();
        Self {
            launch: Mutex::new(launch),
            lang: Mutex::new(lang),
            scale_name: Mutex::new(scale),
            follow: AtomicBool::new(true),
            wander: AtomicBool::new(true),
            on_top: AtomicBool::new(true),
            audio_enabled: AtomicBool::new(true),
            dragging: AtomicBool::new(false),
            placed: AtomicBool::new(false),
            drag_anchor: Mutex::new((0, 0)),
            win_start: Mutex::new((0, 0)),
            walk_active: AtomicBool::new(false),
            walk_cancel: Mutex::new(None),
            look_cancel: Mutex::new(None),
        }
    }
}

pub struct AssetStore(pub std::collections::HashMap<String, String>);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pet_label_all_langs() {
        assert_eq!(pet_label("zh"), "乌萨奇");
        assert_eq!(pet_label("en"), "Usagi");
        assert_eq!(pet_label("ja"), "うさぎ");
        assert_eq!(pet_label("unknown"), "乌萨奇");
    }

    #[test]
    fn t_all_langs() {
        assert_eq!(t("zh", "中文", "English", "日本語"), "中文");
        assert_eq!(t("en", "中文", "English", "日本語"), "English");
        assert_eq!(t("ja", "中文", "English", "日本語"), "日本語");
    }

    #[test]
    fn constants_cover_expected_values() {
        assert_eq!(LANGS, &["zh", "en", "ja"]);
        assert_eq!(SCALES.len(), 3);
        assert!(SCALES.iter().any(|(n, _)| *n == "medium"));
    }
}
