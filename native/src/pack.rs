//! CLI `pack` subcommand — incremental merge into assets.pak.

use crate::vault;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// WebView frontend root (PetEngine, assets.pak).
const WEBVIEW_DIR: &str = "webview";

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            walk(&path, out)?;
        } else {
            out.push(path);
        }
    }
    Ok(())
}

pub fn load_bundle(pak_path: &Path) -> HashMap<String, String> {
    if !pak_path.exists() {
        return HashMap::new();
    }
    match fs::read(pak_path).ok().and_then(|buf| vault::decrypt(&buf).ok()) {
        Some(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        None => HashMap::new(),
    }
}

pub fn assets_to_data_urls(bundle: &HashMap<String, String>) -> HashMap<String, String> {
    bundle
        .iter()
        .map(|(k, b64)| {
            let ext = k.split('.').last().unwrap_or("png").to_lowercase();
            let mime = match ext.as_str() {
                "gif" => "image/gif",
                "jpg" | "jpeg" => "image/jpeg",
                "webp" => "image/webp",
                "mp3" => "audio/mpeg",
                "ogg" => "audio/ogg",
                "wav" => "audio/wav",
                _ => "image/png",
            };
            (k.clone(), format!("data:{mime};base64,{b64}"))
        })
        .collect()
}

pub fn pak_path_dev() -> PathBuf {
    project_root().join(WEBVIEW_DIR).join("assets.pak")
}

pub fn load_assets_from_pak_at(path: &Path) -> HashMap<String, String> {
    let bundle = load_bundle(path);
    assets_to_data_urls(&bundle)
}

pub fn load_assets_from_pak() -> HashMap<String, String> {
    load_assets_from_pak_at(&pak_path_dev())
}

pub fn resolve_pak_path(app: &tauri::AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        return pak_path_dev();
    }
    app.path()
        .resource_dir()
        .map(|d| d.join("assets.pak"))
        .unwrap_or_else(|_| pak_path_dev())
}

pub fn load_assets_for_app(app: &tauri::AppHandle) -> HashMap<String, String> {
    load_assets_from_pak_at(&resolve_pak_path(app))
}

pub(crate) fn is_packable_asset(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let l = e.to_lowercase();
            l == "png"
                || l == "webp"
                || l == "gif"
                || l == "jpg"
                || l == "jpeg"
                || l == "mp3"
                || l == "ogg"
                || l == "wav"
        })
        .unwrap_or(false)
}

pub fn run_pack() -> Result<(), String> {
    let root = project_root();
    let webview = root.join(WEBVIEW_DIR);
    let pak_path = webview.join("assets.pak");

    let mut bundle = load_bundle(&pak_path);
    let kept = bundle.len();

    let mut files = Vec::new();
    for sub in ["images", "audio"] {
        let dir = webview.join(sub);
        if dir.is_dir() {
            walk(&dir, &mut files).map_err(|e| e.to_string())?;
        }
    }
    files.sort();
    files.retain(|f| is_packable_asset(f));

    if files.is_empty() {
        return Err("No packable assets in webview/images/ or webview/audio/.".into());
    }

    for f in &files {
        let rel = f
            .strip_prefix(&webview)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let data = fs::read(f).map_err(|e| e.to_string())?;
        bundle.insert(rel, B64.encode(data));
    }

    let json = serde_json::to_vec(&bundle).map_err(|e| e.to_string())?;
    let enc = vault::encrypt(&json);
    fs::write(&pak_path, &enc).map_err(|e| e.to_string())?;

    println!(
        "packed {} disk asset(s); pak now holds {} (kept {} existing) -> webview/assets.pak ({:.0} KB)",
        files.len(),
        bundle.len(),
        kept,
        enc.len() as f64 / 1024.0
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::TempDir;

    #[test]
    fn assets_to_data_urls_mime() {
        let mut bundle: HashMap<String, String> = HashMap::new();
        bundle.insert("images/a.png".into(), "abc".into());
        bundle.insert("audio/b.mp3".into(), "def".into());
        bundle.insert("images/c.xyz".into(), "ghi".into());

        let urls = assets_to_data_urls(&bundle);
        assert_eq!(urls["images/a.png"], "data:image/png;base64,abc");
        assert_eq!(urls["audio/b.mp3"], "data:audio/mpeg;base64,def");
        assert_eq!(urls["images/c.xyz"], "data:image/png;base64,ghi");
    }

    #[test]
    fn load_bundle_missing_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("missing.pak");
        assert!(load_bundle(&path).is_empty());
    }

    #[test]
    fn load_bundle_roundtrip() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("assets.pak");

        let mut bundle: HashMap<String, String> = HashMap::new();
        bundle.insert("images/test.png".into(), "dGVzdA==".into());
        let json = serde_json::to_vec(&bundle).unwrap();
        fs::write(&path, vault::encrypt(&json)).unwrap();

        let loaded = load_bundle(&path);
        assert_eq!(loaded, bundle);
    }

    #[test]
    fn load_bundle_corrupt_returns_empty() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("bad.pak");
        fs::write(&path, b"not a valid pak").unwrap();
        assert!(load_bundle(&path).is_empty());
    }

    #[test]
    fn is_packable_asset_extensions() {
        assert!(is_packable_asset(Path::new("a.png")));
        assert!(is_packable_asset(Path::new("a.webp")));
        assert!(is_packable_asset(Path::new("b.MP3")));
        assert!(is_packable_asset(Path::new("c.wav")));
        assert!(!is_packable_asset(Path::new("readme.txt")));
        assert!(!is_packable_asset(Path::new("noext")));
    }

    #[test]
    fn incremental_merge_keeps_existing_keys() {
        let dir = TempDir::new().unwrap();
        let webview = dir.path().join(WEBVIEW_DIR);
        let images = webview.join("images");
        fs::create_dir_all(&images).unwrap();

        let pak_path = webview.join("assets.pak");
        let mut bundle: HashMap<String, String> = HashMap::new();
        bundle.insert("images/old.png".into(), "b2xk".into());
        let json = serde_json::to_vec(&bundle).unwrap();
        fs::write(&pak_path, vault::encrypt(&json)).unwrap();

        let new_file = images.join("new.png");
        fs::write(&new_file, b"new-bytes").unwrap();

        let mut merged = load_bundle(&pak_path);
        let data = fs::read(&new_file).unwrap();
        merged.insert("images/new.png".into(), B64.encode(data));

        assert_eq!(merged.len(), 2);
        assert!(merged.contains_key("images/old.png"));
        assert!(merged.contains_key("images/new.png"));
        assert_eq!(merged["images/new.png"], B64.encode(b"new-bytes"));
    }
}
