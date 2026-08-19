// Copyright (c) 2026 CookApps / Casual Office
// SPDX-License-Identifier: Apache-2.0

use tauri::{Emitter, Manager};
use serde::{Deserialize, Serialize};

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
        .invoke_handler(tauri::generate_handler![native_fetch])
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
