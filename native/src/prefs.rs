//! User preference persistence (`prefs.json`).

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const APP_QUALIFIER: &str = "com";
const APP_ORG: &str = "myusagi";
const APP_NAME: &str = "desktop";

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
pub struct Prefs {
    pub lang: Option<String>,
}

pub fn config_dir() -> Option<PathBuf> {
    ProjectDirs::from(APP_QUALIFIER, APP_ORG, APP_NAME).map(|d| d.config_dir().to_path_buf())
}

pub fn prefs_path() -> Option<PathBuf> {
    config_dir().map(|d| d.join("prefs.json"))
}

pub fn load_from_disk() -> Prefs {
    let Some(path) = prefs_path() else {
        return Prefs::default();
    };
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_to_disk(prefs: &Prefs) {
    let Some(dir) = config_dir() else {
        return;
    };
    let _ = fs::create_dir_all(&dir);
    if let Ok(json) = serde_json::to_string(prefs) {
        let _ = fs::write(dir.join("prefs.json"), json);
    }
}

pub fn load(app: &AppHandle) -> Prefs {
    let path = app
        .path()
        .app_config_dir()
        .expect("app config dir")
        .join("prefs.json");
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(load_from_disk)
}

pub fn save(app: &AppHandle, prefs: &Prefs) {
    let path = app
        .path()
        .app_config_dir()
        .expect("app config dir");
    if let Err(_) = fs::create_dir_all(&path) {
        save_to_disk(prefs);
        return;
    }
    if let Ok(json) = serde_json::to_string(prefs) {
        let _ = fs::write(path.join("prefs.json"), json);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefs_default() {
        let p = Prefs::default();
        assert!(p.lang.is_none());
    }

    #[test]
    fn prefs_serde_roundtrip() {
        let p = Prefs {
            lang: Some("en".into()),
        };
        let json = serde_json::to_string(&p).unwrap();
        let back: Prefs = serde_json::from_str(&json).unwrap();
        assert_eq!(back.lang, Some("en".into()));
    }

    #[test]
    fn prefs_serde_invalid_json_uses_default() {
        let back: Prefs = serde_json::from_str("{not json").unwrap_or_default();
        assert!(back.lang.is_none());
    }
}
