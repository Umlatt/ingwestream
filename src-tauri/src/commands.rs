use std::sync::Mutex;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, State, WebviewBuilder, WebviewUrl};

use crate::scripts::WEBVIEW_DARK_INIT;
use crate::state::AppState;

const TITLEBAR_H: f64 = 32.0;

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum AppError {
    #[error("State lock poisoned")]
    StatePoisoned,
    #[error("Tauri error: {0}")]
    Tauri(String),
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Tauri(e.to_string())
    }
}

// ── IPC commands ─────────────────────────────────────────────────────────────

/// Open a service: closes any existing child webview and creates a new one at the given URL.
#[tauri::command]
pub fn open_service(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    service_id: String,
    url: String,
) -> Result<(), AppError> {
    let parsed_url = url
        .parse::<tauri::Url>()
        .map_err(|e| AppError::InvalidUrl(e.to_string()))?;

    // Take the existing view under lock, update active id, then release.
    let old_view = {
        let mut s = state.lock().map_err(|_| AppError::StatePoisoned)?;
        s.active_service_id = Some(service_id.clone());
        s.service_view.take()
    };

    // Close previous child webview OUTSIDE the lock.
    if let Some(v) = old_view {
        log::info!("open_service: closing previous child webview");
        let _ = v.close();
    }

    // Get main window and compute content area size.
    let main = app
        .get_window("main")
        .ok_or_else(|| AppError::Tauri("main window not found".into()))?;

    let inner = main.inner_size()?;
    let scale = main.scale_factor()?;
    let w = inner.width as f64 / scale;
    let h = (inner.height as f64 / scale) - TITLEBAR_H;
    log::info!("open_service: id={service_id} logical_size={w:.0}x{h:.0}");

    // Give the child webview its own data directory so WebView2 on Windows
    // doesn't collide with the main window's user-data folder.
    let data_dir = app
        .path()
        .app_data_dir()
        .map(|p| p.join("service-webview"))
        .unwrap_or_else(|_| std::path::PathBuf::from("service-webview"));

    // WebView2 on Windows requires add_child to run on the Win32 message-loop
    // thread (the main thread) so that COM completion callbacks can be delivered.
    // Tauri command handlers run on a background thread-pool thread where COM
    // callbacks never fire — causing an infinite hang. Dispatch to the main
    // thread and wait on a one-shot channel for the result.
    let (tx, rx) = std::sync::mpsc::channel::<Result<tauri::Webview<tauri::Wry>, tauri::Error>>();
    app.run_on_main_thread(move || {
        let result = main.add_child(
            WebviewBuilder::new("service-view", WebviewUrl::External(parsed_url))
                .initialization_script(WEBVIEW_DARK_INIT)
                .data_directory(data_dir),
            LogicalPosition::new(0.0, TITLEBAR_H),
            LogicalSize::new(w, h.max(0.0)),
        );
        if let Ok(ref v) = result {
            let _ = v.show();
            let _ = v.set_focus();
        }
        let _ = tx.send(result);
    })?;

    let new_view = rx
        .recv()
        .map_err(|_| AppError::Tauri("add_child channel closed".into()))?
        .map_err(AppError::from)?;

    // Store new view under lock.
    {
        let mut s = state.lock().map_err(|_| AppError::StatePoisoned)?;
        s.service_view = Some(new_view);
    }

    log::info!("open_service: child webview created for '{service_id}'");
    Ok(())
}

/// Close and destroy the active service child webview.
#[tauri::command]
pub fn close_service(state: State<'_, Mutex<AppState>>) -> Result<(), AppError> {
    let view = {
        let mut s = state.lock().map_err(|_| AppError::StatePoisoned)?;
        s.active_service_id = None;
        s.service_view.take()
    };

    if let Some(v) = view {
        log::info!("close_service: closing service view");
        let _ = v.close();
    }

    Ok(())
}

/// Show the service child webview — called when the flyout closes.
#[tauri::command]
pub fn show_service_view(state: State<'_, Mutex<AppState>>) -> Result<(), AppError> {
    let view = {
        let s = state.lock().map_err(|_| AppError::StatePoisoned)?;
        s.service_view.clone()
    };

    if let Some(v) = view {
        v.show()?;
        v.set_focus()?;
    }

    Ok(())
}

/// Hide the service child webview — called when the flyout opens.
#[tauri::command]
pub fn hide_service_view(state: State<'_, Mutex<AppState>>) -> Result<(), AppError> {
    let view = {
        let s = state.lock().map_err(|_| AppError::StatePoisoned)?;
        s.service_view.clone()
    };

    if let Some(v) = view {
        v.hide()?;
    }

    Ok(())
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Resize the service child webview to fill the main window content area.
/// Called from the `WindowEvent::Resized` handler in lib.rs.
pub fn resize_service_view(app: &AppHandle) {
    let view = if let Some(state) = app.try_state::<Mutex<AppState>>() {
        if let Ok(s) = state.lock() {
            s.service_view.clone()
        } else {
            return;
        }
    } else {
        return;
    };

    let Some(v) = view else { return };
    let Some(main) = app.get_window("main") else {
        return;
    };
    let Ok(inner) = main.inner_size() else { return };
    let Ok(scale) = main.scale_factor() else {
        return;
    };

    let w = inner.width as f64 / scale;
    let h = (inner.height as f64 / scale) - TITLEBAR_H;

    let _ = v.set_size(tauri::Size::Logical(LogicalSize::new(w, h.max(0.0))));
    let _ = v.set_position(tauri::Position::Logical(LogicalPosition::new(
        0.0, TITLEBAR_H,
    )));
}

/// Forward a media key action to the active service webview via the injected JS bridge.
pub fn dispatch_media_key(app: &AppHandle, action: &str) {
    let view = if let Some(state) = app.try_state::<Mutex<AppState>>() {
        if let Ok(s) = state.lock() {
            s.service_view.clone()
        } else {
            None
        }
    } else {
        None
    };

    if let Some(v) = view {
        let js = format!("if(window.__ingweMedia)window.__ingweMedia('{}');", action);
        let _ = v.eval(&js);
    }
}
