---
applyTo: "src-tauri/src/**/*.rs"
---

# Backend Domain: Tauri v2 IPC · Window State · Tray · Media Keys

## Tauri v2 IPC Architecture

**Command registration:** All commands registered in `lib.rs` via `.invoke_handler(tauri::generate_handler![...])`.

**Type conventions:**
```rust
// Serializable error type for all IPC commands
#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum AppError {
    #[error("Webview not found: {0}")]
    WebviewNotFound(String),
    #[error("State lock poisoned")]
    StatePoisoned,
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}
// Return type pattern: Result<T, AppError>
```

**State container:**
```rust
use std::sync::Mutex;
use std::collections::HashMap;

pub struct AppState {
    pub webviews: HashMap<String, tauri::WebviewWindow>,
    pub active_service: Option<String>,
    pub throttled: std::collections::HashSet<String>,
}

// Registration in lib.rs:
// .manage(Mutex::new(AppState { ... }))
// Access in commands: state: tauri::State<'_, Mutex<AppState>>
```

---

## WebviewWindow Management

**Creation pattern:**
```rust
use tauri::{WebviewWindowBuilder, WebviewUrl};

#[tauri::command]
pub fn open_service(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    service_id: String,
    url: String,
) -> Result<(), AppError> {
    let mut s = state.lock().map_err(|_| AppError::StatePoisoned)?;
    if s.webviews.contains_key(&service_id) {
        return Ok(()); // already open
    }
    let webview = WebviewWindowBuilder::new(
        &app,
        &service_id,
        WebviewUrl::External(url.parse().unwrap()),
    )
    .initialization_script(crate::scripts::WEBVIEW_DARK_INIT)
    .parent_window(app.get_webview_window("main").unwrap().hwnd()?) // embed in main
    .visible(false)
    .build()?;

    s.webviews.insert(service_id, webview);
    Ok(())
}
```

**Focus / hide switching:**
```rust
#[tauri::command]
pub fn switch_service(
    state: tauri::State<'_, Mutex<AppState>>,
    service_id: String,
) -> Result<(), AppError> {
    let mut s = state.lock().map_err(|_| AppError::StatePoisoned)?;
    // Hide current
    if let Some(prev) = &s.active_service.clone() {
        if let Some(wv) = s.webviews.get(prev) {
            wv.hide()?;
        }
    }
    // Show new
    if let Some(wv) = s.webviews.get(&service_id) {
        wv.show()?;
        wv.set_focus()?;
        s.active_service = Some(service_id);
    } else {
        return Err(AppError::WebviewNotFound(service_id));
    }
    Ok(())
}
```

**Window state persistence (`tauri-plugin-window-state`):**
```toml
# Cargo.toml
tauri-plugin-window-state = { version = "2", features = [] }
```
```rust
// lib.rs builder
.plugin(tauri_plugin_window_state::Builder::default().build())
```

---

## System Tray (`tauri-plugin-tray`)

```toml
# Cargo.toml
tauri-plugin-tray = "2"    # included in tauri v2 core — no separate dep needed
```

**Tray setup in `lib.rs`:**
```rust
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::menu::{MenuBuilder, MenuItemBuilder};

pub fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show    = MenuItemBuilder::with_id("show",     "Show Ingwe").build(app)?;
    let prev    = MenuItemBuilder::with_id("prev",     "Previous").build(app)?;
    let play    = MenuItemBuilder::with_id("play",     "Play / Pause").build(app)?;
    let next    = MenuItemBuilder::with_id("next",     "Next").build(app)?;
    let sep     = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit    = MenuItemBuilder::with_id("quit",     "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&show, &prev, &play, &next, &sep, &quit])
        .build()?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| tray_menu_handler(app, event))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up, ..
            } = event {
                if let Some(w) = tray.app_handle().get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}

fn tray_menu_handler(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "show"  => { /* show main window */ }
        "play"  => dispatch_media_key(app, "play"),
        "prev"  => dispatch_media_key(app, "prev"),
        "next"  => dispatch_media_key(app, "next"),
        "quit"  => app.exit(0),
        _       => {}
    }
}
```

**`tauri.conf.json` — tray permission:**
```json
{
  "plugins": {
    "tray": {}
  }
}
```

**`capabilities/default.json` — required permission:**
```json
{
  "permissions": [
    "tray:default"
  ]
}
```

---

## Global Media Key Routing

**Strategy:** Use `tauri-plugin-global-shortcut` to intercept OS media keys. Dispatch JS to active webview.

```toml
# Cargo.toml
tauri-plugin-global-shortcut = "2"
```

```rust
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub fn register_media_shortcuts(app: &tauri::AppHandle) -> tauri::Result<()> {
    let handle = app.clone();
    app.global_shortcut().on_shortcuts(
        ["MediaPlayPause", "MediaTrackNext", "MediaTrackPrevious", "MediaStop"],
        move |_app, shortcut, event| {
            if event.state() != ShortcutState::Pressed { return; }
            let key = match shortcut.key().to_string().as_str() {
                "MediaPlayPause"      => "play",
                "MediaTrackNext"      => "next",
                "MediaTrackPrevious"  => "prev",
                "MediaStop"           => "stop",
                _                     => return,
            };
            dispatch_media_key(&handle, key);
        },
    )?;
    Ok(())
}

pub fn dispatch_media_key(app: &tauri::AppHandle, action: &str) {
    // Retrieve active webview from state and execute JS
    if let Some(state) = app.try_state::<Mutex<AppState>>() {
        if let Ok(s) = state.lock() {
            if let Some(id) = &s.active_service {
                if let Some(wv) = s.webviews.get(id) {
                    let js = format!("window.__ingweMedia('{}');", action);
                    let _ = wv.eval(&js);
                }
            }
        }
    }
}
```

**Frontend media bridge (injected once per webview, part of init_script):**
```js
window.__ingweMedia = function(action) {
  // Map to standard Media Session API or keyboard events
  const keyMap = { play: 'MediaPlayPause', next: 'MediaTrackNext', prev: 'MediaTrackPrevious', stop: 'MediaStop' };
  const key = keyMap[action];
  if (!key) return;
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  // Fallback: Media Session API
  if (navigator.mediaSession?.playbackState !== 'none') {
    const handlers = { play: 'play', next: 'nexttrack', prev: 'previoustrack', stop: 'stop' };
    navigator.mediaSession.callActionHandler?.(handlers[action], null);
  }
};
```

**SMTC (Windows) / MPRIS (Linux):** Handled automatically by the OS once the active webview holds an `<audio>` or `<video>` element with Media Session metadata. No additional Rust code required unless custom metadata emission is needed.

---

## IPC Command Inventory (reference)

| Command | Params | Returns | Description |
|---|---|---|---|
| `open_service` | `service_id`, `url` | `()` | Create hidden WebviewWindow |
| `switch_service` | `service_id` | `()` | Hide prev, show & focus new |
| `close_service` | `service_id` | `()` | Destroy WebviewWindow, free RAM |
| `throttle_service` | `service_id`, `enable: bool` | `()` | Pause JS timers in background wv |
| `get_active_service` | — | `Option<String>` | Current visible service ID |

---

## `tauri.conf.json` Baseline

```json
{
  "productName": "Ingwe",
  "identifier": "com.ingwe.app",
  "app": {
    "withGlobalTauri": false,
    "windows": [{
      "label": "main",
      "title": "Ingwe",
      "width": 1200,
      "height": 800,
      "minWidth": 800,
      "minHeight": 600,
      "decorations": false,
      "transparent": false,
      "resizable": true,
      "visible": false
    }]
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png","icons/128x128.png","icons/128x128@2x.png","icons/icon.icns","icons/icon.ico"]
  }
}
```

## Capability Permissions Checklist

```json
{
  "permissions": [
    "core:default",
    "tray:default",
    "global-shortcut:default",
    "window-state:default",
    "webview:default"
  ]
}
```
