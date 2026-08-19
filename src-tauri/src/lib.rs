// Copyright (c) 2026 CookApps / Casual Office
// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct NativeHttpRequest {
    pub url: String,
    pub method: String,
    pub headers: Option<Vec<(String, String)>>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NativeHttpResponse {
    pub status: u16,
    pub body: String,
    pub ok: bool,
}

/// Native HTTP fetch command - bypasses WebView2 CORS completely
#[tauri::command]
async fn native_fetch(req: NativeHttpRequest) -> Result<NativeHttpResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let method = match req.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        other => reqwest::Method::from_bytes(other.as_bytes())
            .map_err(|e| format!("Invalid method: {e}"))?,
    };

    let mut builder = client.request(method, &req.url);

    if let Some(headers) = req.headers {
        for (key, val) in headers {
            builder = builder.header(&key, &val);
        }
    }

    if let Some(body) = req.body {
        builder = builder.body(body);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    let status = response.status().as_u16();
    let ok = response.status().is_success();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;

    Ok(NativeHttpResponse { status, body, ok })
}

/// Opens native Save File dialog to pick path for saving PDF.
/// Defaults to user's Downloads or Documents folder if cancelled or automated.
#[tauri::command]
async fn pick_save_path(suggested_name: Option<String>) -> Result<Option<String>, String> {
    let default_name = suggested_name.unwrap_or_else(|| "document.pdf".to_string());

    let mut dialog = rfd::AsyncFileDialog::new()
        .set_file_name(&default_name)
        .add_filter("PDF Document", &["pdf"]);

    if let Some(user_dirs) = directories::UserDirs::new() {
        if let Some(download_dir) = user_dirs.download_dir() {
            dialog = dialog.set_directory(download_dir);
        } else if let Some(document_dir) = user_dirs.document_dir() {
            dialog = dialog.set_directory(document_dir);
        }
    }

    if let Some(file_handle) = dialog.save_file().await {
        return Ok(Some(file_handle.path().to_string_lossy().to_string()));
    }

    // Fallback default path if cancelled: Downloads/suggested_name
    if let Some(user_dirs) = directories::UserDirs::new() {
        let fallback_dir = user_dirs.download_dir().or_else(|| user_dirs.document_dir());
        if let Some(dir) = fallback_dir {
            let path = dir.join(&default_name);
            return Ok(Some(path.to_string_lossy().to_string()));
        }
    }

    Ok(None)
}

/// Opens native Open File dialog to pick a PDF.
#[tauri::command]
async fn pick_open_document() -> Result<Option<String>, String> {
    let mut dialog = rfd::AsyncFileDialog::new().add_filter("PDF Document", &["pdf"]);

    if let Some(user_dirs) = directories::UserDirs::new() {
        if let Some(download_dir) = user_dirs.download_dir() {
            dialog = dialog.set_directory(download_dir);
        }
    }

    if let Some(file_handle) = dialog.pick_file().await {
        return Ok(Some(file_handle.path().to_string_lossy().to_string()));
    }

    Ok(None)
}

#[tauri::command]
fn document_size(path: String) -> Result<u64, String> {
    fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("Failed to read metadata for {path}: {e}"))
}

#[tauri::command]
fn read_document_chunk(path: String, offset: u64, length: usize) -> Result<Vec<u8>, String> {
    let mut file = File::open(&path).map_err(|e| format!("Failed to open {path}: {e}"))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Failed to seek in {path}: {e}"))?;

    let mut buffer = vec![0u8; length];
    let n = file
        .read(&mut buffer)
        .map_err(|e| format!("Failed to read chunk from {path}: {e}"))?;
    buffer.truncate(n);
    Ok(buffer)
}

#[tauri::command]
fn begin_save_document(path: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    File::create(&path)
        .map_err(|e| format!("Failed to create {path}: {e}"))
        .map(|_| ())
}

#[tauri::command]
fn write_save_document_chunk(path: String, offset: u64, bytes: Vec<u8>) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .open(&path)
        .map_err(|e| format!("Failed to open {path} for writing: {e}"))?;

    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Failed to seek in {path}: {e}"))?;

    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write chunk to {path}: {e}"))
}

#[tauri::command]
fn commit_save_document(path: String) -> Result<(), String> {
    let file = OpenOptions::new()
        .write(true)
        .open(&path)
        .map_err(|e| format!("Failed to open {path} for sync: {e}"))?;
    file.sync_all()
        .map_err(|e| format!("Failed to sync {path}: {e}"))
}

#[tauri::command]
fn set_window_dirty(_dirty: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn add_recent_file(_path: String) -> Result<(), String> {
    Ok(())
}

fn get_storage_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
fn token_get(app_handle: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    let dir = get_storage_dir(&app_handle).join("tokens");
    let safe_name = name.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '_', "_");
    let path = dir.join(format!("{safe_name}.json"));

    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("Failed to read token {name}: {e}"))
}

#[tauri::command]
fn token_set(app_handle: tauri::AppHandle, name: String, value: String) -> Result<(), String> {
    let dir = get_storage_dir(&app_handle).join("tokens");
    let _ = fs::create_dir_all(&dir);

    let safe_name = name.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '_', "_");
    let path = dir.join(format!("{safe_name}.json"));

    if value.is_empty() {
        let _ = fs::remove_file(path);
    } else {
        fs::write(&path, value).map_err(|e| format!("Failed to write token {name}: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn identity_get(app_handle: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    token_get(app_handle, format!("id_{name}"))
}

#[tauri::command]
fn identity_set(app_handle: tauri::AppHandle, name: String, p12_base64: String) -> Result<(), String> {
    token_set(app_handle, format!("id_{name}"), p12_base64)
}

#[tauri::command]
fn resolve_system_font(_family: String, _weight: u32, _italic: bool) -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
fn open_document_window(_kind: String, _file_path: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn write_recovery(app_handle: tauri::AppHandle, path: String, bytes: Vec<u8>) -> Result<(), String> {
    let dir = get_storage_dir(&app_handle).join("recovery");
    let _ = fs::create_dir_all(&dir);
    let hash = format!("{:x}", simple_hash(&path));
    fs::write(dir.join(format!("{hash}.rec")), bytes).map_err(|e| format!("{e}"))
}

#[tauri::command]
fn read_recovery(app_handle: tauri::AppHandle, path: String) -> Result<Option<Vec<u8>>, String> {
    let dir = get_storage_dir(&app_handle).join("recovery");
    let hash = format!("{:x}", simple_hash(&path));
    let rec_path = dir.join(format!("{hash}.rec"));
    if !rec_path.exists() {
        return Ok(None);
    }
    fs::read(&rec_path).map(Some).map_err(|e| format!("{e}"))
}

#[tauri::command]
fn clear_recovery(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let dir = get_storage_dir(&app_handle).join("recovery");
    let hash = format!("{:x}", simple_hash(&path));
    let _ = fs::remove_file(dir.join(format!("{hash}.rec")));
    Ok(())
}

fn simple_hash(s: &str) -> u128 {
    let mut hash: u128 = 0;
    for b in s.bytes() {
        hash = hash.wrapping_mul(31).wrapping_add(b as u128);
    }
    hash
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            for arg in argv {
                if arg.starts_with("cookapps-cpdf://") {
                    let _ = app.emit("cpdf:deeplink", serde_json::json!({ "url": arg }));
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            native_fetch,
            pick_save_path,
            pick_open_document,
            document_size,
            read_document_chunk,
            begin_save_document,
            write_save_document_chunk,
            commit_save_document,
            set_window_dirty,
            add_recent_file,
            token_get,
            token_set,
            identity_get,
            identity_set,
            resolve_system_font,
            open_document_window,
            write_recovery,
            read_recovery,
            clear_recovery
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let app_handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let url_str = url.to_string();
                        if url_str.starts_with("cookapps-cpdf://") {
                            let _ = app_handle.emit("cpdf:deeplink", serde_json::json!({ "url": url_str }));
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running CPDF tauri application");
}
