use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewBuilder, WebviewUrl};
use tauri::webview::PageLoadEvent;

use crate::scripts::WEBVIEW_DARK_INIT;
use crate::state::AppState;

const TITLEBAR_H: f64 = 32.0;
const SIDEBAR_W:  f64 = 208.0; // Tailwind w-52 = 52×4 px

// Per-action debounce state — prevents key-repeat from skipping multiple tracks.
static MEDIA_DEBOUNCE: std::sync::OnceLock<Mutex<HashMap<String, Instant>>> =
    std::sync::OnceLock::new();
const DEBOUNCE_MS: u64 = 300;

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum AppError {
    #[error("State lock poisoned")]
    StatePoisoned,
    #[error("Tauri error: {0}")]
    Tauri(String),
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    #[error("HTTP error: {0}")]
    Http(String),
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Tauri(e.to_string())
    }
}

// ── Startup initialisation ────────────────────────────────────────────────────

pub fn init_service_webview(app: &AppHandle) -> Result<(), AppError> {
    let main = app
        .get_window("main")
        .ok_or_else(|| AppError::Tauri("main window not found".into()))?;

    let inner = main.inner_size()?;
    let scale = main.scale_factor()?;
    let w = inner.width as f64 / scale;
    let h = (inner.height as f64 / scale) - TITLEBAR_H;

    let blank_url = "about:blank"
        .parse::<tauri::Url>()
        .map_err(|e| AppError::InvalidUrl(e.to_string()))?;

    // Belt-and-suspenders injection: initialization_script may silently fail for
    // child webviews on Windows/WebView2, so on_page_load re-injects on every
    // page load completion.  The guard prevents double-injection when both run.
    let inject_js = format!(
        "if(!window.__ingweMediaInjected){{window.__ingweMediaInjected=true;{}}}",
        WEBVIEW_DARK_INIT
    );

    log::info!("init_service_webview: creating child webview logical_size={w:.0}x{h:.0}");
    let service_view = main.add_child(
        WebviewBuilder::new("service-view", WebviewUrl::External(blank_url))
            .initialization_script(WEBVIEW_DARK_INIT)
            .on_page_load(move |webview, payload| {
                let url = payload.url().as_str();
                let internal = url.starts_with("about:") || url.starts_with("data:");
                let app = webview.app_handle();
                match payload.event() {
                    PageLoadEvent::Started => {
                        if !internal {
                            let _ = app.emit("service-load-started", url.to_string());
                        }
                    }
                    PageLoadEvent::Finished => {
                        if !internal {
                            if let Err(e) = webview.eval(&inject_js) {
                                log::warn!("on_page_load: inject failed: {e}");
                            } else {
                                log::info!("on_page_load: injected media bridge for {url}");
                            }
                            let _ = app.emit("service-load-finished", url.to_string());
                        }
                    }
                }
            }),
        LogicalPosition::new(0.0, TITLEBAR_H),
        LogicalSize::new(w, h.max(0.0)),
    )?;
    service_view.hide()?;
    log::info!("init_service_webview: child webview created and hidden");

    let state = app
        .try_state::<Mutex<AppState>>()
        .ok_or_else(|| AppError::Tauri("AppState not managed".into()))?;
    let mut s = state.lock().map_err(|_| AppError::StatePoisoned)?;
    s.service_view = Some(service_view);
    Ok(())
}

// ── URI scheme handlers ───────────────────────────────────────────────────────

pub fn handle_ctrl_protocol(app: &AppHandle, uri: String) {
    let a = match extract_query_param(&uri, "a") {
        Some(v) => v,
        None => return,
    };
    let state = match app.try_state::<Mutex<AppState>>() {
        Some(s) => s,
        None => return,
    };
    let is_fullscreen = state.lock().map(|s| s.is_fullscreen).unwrap_or(false);
    if !is_fullscreen {
        return;
    }
    match a.as_str() {
        "top-enter" | "1" => { let _ = app.emit("edge-enter", ()); }
        "top-leave" | "0" => { let _ = app.emit("edge-leave", ()); }
        "left-enter"      => { let _ = app.emit("edge-left-enter", ()); }
        "left-leave"      => { let _ = app.emit("edge-left-leave", ()); }
        "escape"          => { toggle_fullscreen_from_shortcut(app); }
        "script-ready"    => { log::info!("service webview init script loaded"); }
        _ => {}
    }
}

pub fn handle_notify_protocol(app: &AppHandle, uri: String) {
    let title = extract_query_param(&uri, "title").unwrap_or_default();
    let body = extract_query_param(&uri, "body").unwrap_or_default();
    if title.is_empty() {
        return;
    }
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title(&title)
        .body(&body)
        .show();
    log::info!("notify: title={title:?}");
}

fn extract_query_param(uri: &str, key: &str) -> Option<String> {
    let query = uri.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        if kv.next()? == key {
            let raw = kv.next().unwrap_or("");
            return Some(url_decode(raw));
        }
    }
    None
}

fn url_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                out.push(byte as char);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            out.push(' ');
            i += 1;
            continue;
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

// ── IPC commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn open_service(
    state: State<'_, Mutex<AppState>>,
    service_id: String,
    url: String,
) -> Result<(), AppError> {
    let parsed_url = url
        .parse::<tauri::Url>()
        .map_err(|e| AppError::InvalidUrl(e.to_string()))?;

    let (view, is_same_service) = {
        let mut s = state.lock().map_err(|_| AppError::StatePoisoned)?;
        let same = s.active_service_id.as_deref() == Some(service_id.as_str());
        s.active_service_id = Some(service_id.clone());
        // Clear sidebar overlay when a service is selected
        s.overlay_sidebar = false;
        (s.service_view.clone(), same)
    };

    let v = view.ok_or_else(|| AppError::Tauri("service webview not initialized".into()))?;

    log::info!("open_service: id={service_id} same_service={is_same_service}");
    if !is_same_service {
        let url_json = serde_json::to_string(parsed_url.as_str())
            .map_err(|e| AppError::Tauri(e.to_string()))?;
        v.eval(&format!("window.location.href = {url_json};"))?;
    }
    v.show()?;
    if let Err(e) = v.set_focus() {
        log::warn!("open_service: set_focus failed (non-fatal): {e}");
    }
    Ok(())
}

/// Force-navigate the service webview to the given URL even when the requested
/// service is already active. Used by the sidebar's right-click "reset to
/// default URL" action so a user can recover from being lost deep in a service.
#[tauri::command]
pub fn reset_service(
    state: State<'_, Mutex<AppState>>,
    service_id: String,
    url: String,
) -> Result<(), AppError> {
    let parsed_url = url
        .parse::<tauri::Url>()
        .map_err(|e| AppError::InvalidUrl(e.to_string()))?;

    let view = {
        let mut s = state.lock().map_err(|_| AppError::StatePoisoned)?;
        s.active_service_id = Some(service_id.clone());
        s.overlay_sidebar = false;
        s.service_view.clone()
    };

    let v = view.ok_or_else(|| AppError::Tauri("service webview not initialized".into()))?;

    let url_json = serde_json::to_string(parsed_url.as_str())
        .map_err(|e| AppError::Tauri(e.to_string()))?;
    log::info!("reset_service: id={service_id} url={url}");
    v.eval(&format!("window.location.href = {url_json};"))?;
    v.show()?;
    if let Err(e) = v.set_focus() {
        log::warn!("reset_service: set_focus failed (non-fatal): {e}");
    }
    Ok(())
}

#[tauri::command]
pub fn close_service(state: State<'_, Mutex<AppState>>) -> Result<(), AppError> {
    let view = {
        let mut s = state.lock().map_err(|_| AppError::StatePoisoned)?;
        s.active_service_id = None;
        s.service_view.clone()
    };

    if let Some(v) = view {
        log::info!("close_service: hiding service view");
        v.hide()?;
    }
    Ok(())
}

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

#[tauri::command]
pub fn toggle_fullscreen_layout(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), AppError> {
    let new_fullscreen = {
        let mut s = state.lock().map_err(|_| AppError::StatePoisoned)?;
        s.is_fullscreen = !s.is_fullscreen;
        // Clear overlay state on any fullscreen toggle
        s.overlay_titlebar = false;
        s.overlay_sidebar = false;
        s.is_fullscreen
    };

    apply_os_fullscreen(&app, new_fullscreen);

    // Attempt resize directly — wry may handle thread dispatch internally.
    // Also queue via run_on_main_thread as belt-and-suspenders.
    apply_resize_all(&app);
    let app_clone = app.clone();
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.run_on_main_thread(move || apply_resize_all(&app_clone));
    }

    app.emit("fullscreen-changed", new_fullscreen)
        .map_err(|e| AppError::Tauri(e.to_string()))?;
    log::info!("toggle_fullscreen_layout: fullscreen={new_fullscreen}");
    Ok(())
}

/// Called from React after fullscreen-changed is processed, to ensure resize
/// is applied even if the initial run_on_main_thread was too early.
#[tauri::command]
pub fn apply_fullscreen_resize(app: AppHandle) -> Result<(), AppError> {
    apply_resize_all(&app);
    let app_clone = app.clone();
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.run_on_main_thread(move || apply_resize_all(&app_clone));
    }
    Ok(())
}

#[tauri::command]
pub fn show_titlebar_overlay(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    visible: bool,
) -> Result<(), AppError> {
    {
        let mut s = state.lock().map_err(|_| AppError::StatePoisoned)?;
        if !s.is_fullscreen {
            return Ok(());
        }
        s.overlay_titlebar = visible;
    }
    apply_resize_all(&app);
    let app_clone = app.clone();
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.run_on_main_thread(move || apply_resize_all(&app_clone));
    }
    app.emit("overlay-changed", visible)
        .map_err(|e| AppError::Tauri(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn update_window_icon(app: AppHandle, favicon_url: String) -> Result<(), AppError> {
    let bytes = reqwest::get(&favicon_url)
        .await
        .map_err(|e| AppError::Http(e.to_string()))?
        .bytes()
        .await
        .map_err(|e| AppError::Http(e.to_string()))?
        .to_vec();

    match tauri::image::Image::from_bytes(&bytes) {
        Ok(img) => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_icon(img);
            }
        }
        Err(e) => log::warn!("update_window_icon: could not decode favicon: {e}"),
    }
    Ok(())
}

#[tauri::command]
pub fn reset_window_icon(app: AppHandle) -> Result<(), AppError> {
    if let Some(w) = app.get_webview_window("main") {
        if let Some(icon) = app.default_window_icon() {
            w.set_icon(icon.clone())?;
        }
    }
    Ok(())
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Unified resize: positions the service view based on all overlay flags.
/// Safe to call from any thread; called both directly and via run_on_main_thread.
pub fn apply_resize_all(app: &AppHandle) {
    let (view, is_fullscreen, ov_tb, ov_sb) =
        if let Some(state) = app.try_state::<Mutex<AppState>>() {
            if let Ok(s) = state.lock() {
                (s.service_view.clone(), s.is_fullscreen, s.overlay_titlebar, s.overlay_sidebar)
            } else {
                return;
            }
        } else {
            return;
        };

    let Some(v) = view else { return };
    let Some(main) = app.get_window("main") else { return };
    let Ok(inner) = main.inner_size() else { return };
    let Ok(scale) = main.scale_factor() else { return };

    let w = inner.width as f64 / scale;
    let total_h = inner.height as f64 / scale;

    let (x, y, vw, vh) = if is_fullscreen {
        let x = if ov_sb { SIDEBAR_W } else { 0.0 };
        let y = if ov_tb { TITLEBAR_H } else { 0.0 };
        (x, y, (w - x).max(0.0), (total_h - y).max(0.0))
    } else {
        (0.0, TITLEBAR_H, w, (total_h - TITLEBAR_H).max(0.0))
    };

    let _ = v.set_size(tauri::Size::Logical(LogicalSize::new(vw, vh)));
    let _ = v.set_position(tauri::Position::Logical(LogicalPosition::new(x, y)));
}

/// Kept as a public alias so `on_window_event` and shortcut code can call it.
pub fn resize_service_view(app: &AppHandle) {
    apply_resize_all(app);
}

pub fn dispatch_media_key(app: &AppHandle, action: &str) {
    // Debounce: key-repeat on Windows fires RegisterHotKey many times per second.
    {
        let map = MEDIA_DEBOUNCE.get_or_init(|| Mutex::new(HashMap::new()));
        if let Ok(mut m) = map.lock() {
            let now = Instant::now();
            if let Some(last) = m.get(action) {
                if now.duration_since(*last) < Duration::from_millis(DEBOUNCE_MS) {
                    return;
                }
            }
            m.insert(action.to_string(), now);
        }
    }

    let view = if let Some(state) = app.try_state::<Mutex<AppState>>() {
        if let Ok(s) = state.lock() {
            if s.active_service_id.is_some() {
                s.service_view.clone()
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    if let Some(v) = view {
        let js = format!("if(window.__ingweMedia)window.__ingweMedia('{}');", action);
        match v.eval(&js) {
            Ok(_)  => log::info!("dispatch_media_key: eval ok action={action}"),
            Err(e) => log::warn!("dispatch_media_key: eval failed action={action}: {e}"),
        }
    } else {
        log::warn!("dispatch_media_key: no active service for action={action}");
    }
}

pub fn toggle_fullscreen_from_shortcut(app: &AppHandle) {
    let state = match app.try_state::<Mutex<AppState>>() {
        Some(s) => s,
        None => return,
    };
    let new_fullscreen = match state.lock() {
        Ok(mut s) => {
            s.is_fullscreen = !s.is_fullscreen;
            s.overlay_titlebar = false;
            s.overlay_sidebar = false;
            s.is_fullscreen
        }
        Err(_) => return,
    };
    apply_os_fullscreen(app, new_fullscreen);
    apply_resize_all(app);
    let app_clone = app.clone();
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.run_on_main_thread(move || apply_resize_all(&app_clone));
    }
    let _ = app.emit("fullscreen-changed", new_fullscreen);
    log::info!("F11 fullscreen: {new_fullscreen}");
}

/// Drive the OS window into / out of true fullscreen so the taskbar is properly
/// hidden by the compositor rather than just painted-over by a frameless window.
fn apply_os_fullscreen(app: &AppHandle, fullscreen: bool) {
    if let Some(main) = app.get_webview_window("main") {
        if let Err(e) = main.set_fullscreen(fullscreen) {
            log::warn!("set_fullscreen({fullscreen}) failed: {e}");
        }
    }
}
