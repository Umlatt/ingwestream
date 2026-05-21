# IngweStream — Backend Deep Context

## Crate topology

```text
src-tauri/src/
├── main.rs       — binary entry; calls lib::run()
├── lib.rs        — tauri::Builder: plugins, URI schemes, state, handler, setup, events
├── state.rs      — AppState { service_view, active_service_id, is_fullscreen, … }
├── commands.rs   — #[tauri::command] fns + resize helpers + media dispatch + debounce
├── scripts.rs    — WEBVIEW_DARK_INIT JS constant (injected into child webview)
├── tray.rs       — system tray construction + menu/click event handlers
└── shortcuts.rs  — global media key + F11 registration (catch_unwind safe)
```

---

## Key dependencies (`Cargo.toml`)

```toml
tauri                     = { version = "2", features = ["tray-icon", "unstable", "devtools", "image-png", "image-ico"] }
tauri-plugin-opener       = "2"
tauri-plugin-window-state = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-log          = "2"
tauri-plugin-store        = "2"
tauri-plugin-notification = "2"
reqwest  = { version = "0.12", default-features = false, features = ["default-tls"] }
log      = "0.4"
thiserror = "2"
serde    = { version = "1", features = ["derive"] }
serde_json = "1"
tokio    = { version = "1", features = ["time"] }
```

- `unstable` — required for `Window::add_child()` to create the child webview.
- `devtools` — enables F12 devtools inside the child webview in dev builds.
- `tray-icon` — system tray support.
- `image-png` / `image-ico` — favicon byte decoding for `update_window_icon`.
- `reqwest` — HTTP client for fetching favicon bytes in `update_window_icon`.

---

## AppState (`state.rs`)

```rust
pub struct AppState {
    pub service_view:        Option<tauri::Webview<tauri::Wry>>,
    pub active_service_id:   Option<String>,
    pub is_fullscreen:       bool,
    pub overlay_titlebar:    bool,   // true when titlebar hover-overlay is visible
    pub overlay_sidebar:     bool,   // true when sidebar hover-overlay is visible
}
```

Stored as `Mutex<AppState>`. Rule: lock → take/clone → drop lock → do I/O.
Never hold the lock across an `eval()`, `show()`, `hide()`, or async boundary.

`service_view` is created once by `init_service_webview` in `setup` and kept alive for the
entire app lifetime. It is `None` only until setup completes.

---

## AppError (`commands.rs`)

```rust
#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum AppError {
    #[error("State lock poisoned")]  StatePoisoned,
    #[error("Tauri error: {0}")]     Tauri(String),
    #[error("Invalid URL: {0}")]     InvalidUrl(String),
    #[error("HTTP error: {0}")]      Http(String),
}
```

---

## Constants (`commands.rs`)

```rust
const TITLEBAR_H: f64 = 32.0;
const SIDEBAR_W:  f64 = 208.0;  // Tailwind w-52
const DEBOUNCE_MS: u64 = 300;

static MEDIA_DEBOUNCE: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
```

---

## Startup: `init_service_webview(app)` (non-command)

Called once from `setup`. Creates the persistent child webview on the Win32 main thread.

```rust
pub fn init_service_webview(app: &AppHandle) -> Result<(), AppError> {
    // 1. Get main window dimensions → compute logical size (w × h-TITLEBAR_H)
    // 2. Build inject_js with __ingweMediaInjected guard around WEBVIEW_DARK_INIT
    // 3. WebviewBuilder::new("service-view", WebviewUrl::External("about:blank"))
    //      .initialization_script(WEBVIEW_DARK_INIT)   // belt-and-suspenders
    //      .on_page_load(move |webview, payload| {      // primary injection path
    //          if Finished && !about: && !data: { webview.eval(&inject_js) }
    //      })
    // 4. main.add_child(builder, LogicalPosition(0.0, TITLEBAR_H), LogicalSize(w, h))
    // 5. service_view.hide()
    // 6. Store handle in AppState
}
```

**Why both `initialization_script` and `on_page_load`?**
On Windows/WebView2, `initialization_script` silently fails for child webviews created via
`add_child` — `AddScriptToExecuteOnDocumentCreated` is not called. The `on_page_load`
callback is the reliable path. The `window.__ingweMediaInjected` guard prevents
double-injection when both fire.

**Critical:** Never call `add_child` from a command handler or Tokio thread.
See `.claude/windows-webview2.md` for the full threading model.

---

## IPC commands

### `open_service(state, service_id, url)`

1. Parse + validate URL → `InvalidUrl` on failure.
2. Lock state → record `active_service_id`, check `is_same_service`, clear `overlay_sidebar`,
   clone view → drop lock.
3. If not same service: `v.eval("window.location.href = <url_json>;")`.
4. `v.show()`.
5. `v.set_focus()` — non-fatal; logs warning if it fails (HRESULT 0x80070057 on some services).

### `close_service(state)`

Lock → `active_service_id = None`, clone view → drop lock → `view.hide()`.
Webview is **hidden, not destroyed**. Next `open_service` navigates the retained handle.

### `show_service_view(state)` / `hide_service_view(state)`

Called when the sidebar flyout or wizard opens/closes. Lock → clone → drop → show/hide.

### `toggle_fullscreen_layout(app, state)`

Toggles `is_fullscreen`, clears overlay flags, calls `apply_resize_all` (direct + via
`run_on_main_thread`), emits `fullscreen-changed: bool` event.

### `apply_fullscreen_resize(app)`

Called from React after processing `fullscreen-changed`, as a belt-and-suspenders resize
in case the initial `run_on_main_thread` fired before React re-rendered.

### `show_titlebar_overlay(app, state, visible: bool)`

Only acts when `is_fullscreen`. Sets `overlay_titlebar`, calls `apply_resize_all`,
emits `overlay-changed: bool`.

### `update_window_icon(app, favicon_url: String)` (async)

Fetches favicon bytes via `reqwest`, decodes with `tauri::image::Image::from_bytes`,
calls `window.set_icon(img)` on the main window.

### `reset_window_icon(app)`

Restores `app.default_window_icon()` via `window.set_icon`.

### `apply_resize_all(app)` (non-command helper)

Unified resize function. Reads `(service_view, is_fullscreen, overlay_titlebar, overlay_sidebar)`
from state, queries main window size + scale factor, then:

```text
Normal mode:    x=0,         y=TITLEBAR_H, w=full,         h=full-TITLEBAR_H
Fullscreen:     x=ov_sb?SIDEBAR_W:0,  y=ov_tb?TITLEBAR_H:0,
                w=full-x,    h=full-y
```

Called from: `toggle_fullscreen_layout`, `apply_fullscreen_resize`, `show_titlebar_overlay`,
`on_window_event(Resized)`.

### `dispatch_media_key(app, action)` (non-command)

1. **Debounce**: checks per-action `Instant` in `MEDIA_DEBOUNCE` — returns early if last
   dispatch was < 300 ms ago (prevents Windows `RegisterHotKey` key-repeat spam).
2. Checks `active_service_id.is_some()` — returns early if no service is active.
3. `v.eval("if(window.__ingweMedia)window.__ingweMedia('<action>');")`.

### `toggle_fullscreen_from_shortcut(app)` (non-command)

Same logic as `toggle_fullscreen_layout` but called directly from the F11 shortcut
handler, bypassing the IPC command layer.

---

## lib.rs builder

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_log::…)
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_notification::init())
    .register_uri_scheme_protocol("ingwe-notify", |ctx, req| {
        commands::handle_notify_protocol(ctx.app_handle(), req.uri().to_string());
        Response::builder().status(200)…
    })
    .register_uri_scheme_protocol("ingwe-ctrl", |ctx, req| {
        commands::handle_ctrl_protocol(ctx.app_handle(), req.uri().to_string());
        Response::builder().status(200)…
    })
    .manage(Mutex::new(AppState::new()))
    .invoke_handler(tauri::generate_handler![
        commands::open_service,
        commands::close_service,
        commands::show_service_view,
        commands::hide_service_view,
        commands::toggle_fullscreen_layout,
        commands::apply_fullscreen_resize,
        commands::update_window_icon,
        commands::reset_window_icon,
        commands::show_titlebar_overlay,
    ])
    .setup(|app| {
        tray::build_tray(&app.handle())?;
        shortcuts::register_media_shortcuts(&app.handle())?;  // soft-fail
        app.get_webview_window("main").map(|w| { w.show(); w.set_focus(); });
        commands::init_service_webview(&app.handle())?;
        Ok(())
    })
    .on_window_event(|window, event| {
        if window.label() == "main" {
            if let WindowEvent::Resized(_) = event {
                commands::resize_service_view(window.app_handle()); // alias for apply_resize_all
            }
        }
    })
```

`init_service_webview` must come after `w.show()` so the main window HWND is realised
before `add_child` attaches to it.

---

## URI scheme handlers

### `handle_notify_protocol(app, uri)`

Parses `?title=…&body=…` from the URI (URL-decoded). Uses `tauri_plugin_notification` to
show a native OS notification. Called from the `ingwe-notify://` scheme handler in lib.rs.

### `handle_ctrl_protocol(app, uri)`

Parses `?a=<action>`. Only acts when `is_fullscreen = true`. Emits Tauri events:

| `a=`          | Emitted event       |
| ------------- | ------------------- |
| `top-enter`   | `edge-enter`        |
| `top-leave`   | `edge-leave`        |
| `left-enter`  | `edge-left-enter`   |
| `left-leave`  | `edge-left-leave`   |
| `script-ready`| logs info only      |

---

## tray.rs

Menu: **Show IngweStream** / Previous / Play-Pause / Next / — / Quit.
Left-click on tray icon: `w.unminimize()` + `w.show()` + `w.set_focus()`.
"Show IngweStream" menu item: same three calls.
Media items call `commands::dispatch_media_key(app, action)`.

`unminimize()` is required before `show()` — `show()` alone does not restore a minimised
window on Windows (`SW_SHOW` vs `SW_RESTORE`).

---

## shortcuts.rs

Registers `MediaPlayPause`, `MediaTrackNext`, `MediaTrackPrevious`, `MediaStop`, and `F11`
via `tauri_plugin_global_shortcut`.

**Each registration is wrapped in `std::panic::catch_unwind(AssertUnwindSafe(…))`**
because on Linux/WSLg, `XGrabKey` panics if the desktop environment already owns the key.
Failed registrations are logged as warnings; setup continues regardless.

```text
Media keys → dispatch_media_key(app, action)  [+ 300 ms debounce in dispatch_media_key]
F11        → toggle_fullscreen_from_shortcut(app)
```

---

## scripts.rs — WEBVIEW_DARK_INIT

Injected into the child webview on every page load. Eight sections:

| # | Purpose |
| --- | --- |
| 1 | Append `<meta name="color-scheme" content="dark">` to `<head>` |
| 2 | Inject `<style>:root{color-scheme:dark!important}html,body{background:#000!important;…}</style>` |
| 3 | Override `window.matchMedia` — returns a plain object (not a `MediaQueryList`) for `(prefers-color-scheme: dark)` with `matches: true`. Avoids `TypeError` from `Object.assign` in MUI/similar frameworks. |
| 4 | Notification bridge — replaces `window.Notification` with `IngweNotification` that fetches `ingwe-notify://?title=…&body=…`. `Notification.permission` returns `"granted"`. |
| 5 | `window.__ingweMedia(action)` — media bridge. `findMediaElements()` searches light+shadow DOM. `tryClick()` clicks light DOM buttons. `tryClickShadow()` targets `ytmusic-player-bar` shadow root. `dispatchKey()` dispatches to document+window only (NOT activeElement). **play**: element toggle → button click → YTM shadow → key fallback. **next/prev**: button → YTM shadow → Shift+N/P → MediaTrackNext/Prev. **stop**: MediaStop. |
| 6 | Edge hover detection — `mousemove` calls `notifyTop(e.clientY <= 4)` and `notifyLeft(e.clientX <= 4)`, each fetching `ingwe-ctrl://?a=<enter\|leave>` on state change |
| 7 | Physical media key capture — `capture: true` keydown listener intercepts trusted `MediaPlayPause`, `MediaTrackNext`, `MediaTrackPrevious`, `MediaStop` events, calls `stopPropagation` + `preventDefault`, routes through `__ingweMedia` |
| 8 | Diagnostic ping — `fetch('ingwe-ctrl://?a=script-ready')` so Rust logs confirm injection |

`SUSPEND_SCRIPT` / `RESUME_SCRIPT` — constants defined but not yet actively called.
Available for future background-tab throttling (freeze timers, mute audio).

---

## Registering a new command

1. Add `pub fn my_command(…) → Result<T, AppError>` with `#[tauri::command]` in `commands.rs`.
2. Add `commands::my_command` to the `invoke_handler` list in `lib.rs`.
3. Add the permission to `capabilities/default.json`.
4. Call from TypeScript: `invoke("my_command", { arg1, arg2 })`.

---

## Logging

`tauri-plugin-log` writes to stdout and to the platform log directory:

- **Windows**: `%LOCALAPPDATA%\com.lazylionconsulting.ingwestream\logs\ingwe.log`
- **Linux**: `~/.local/share/com.lazylionconsulting.ingwestream/logs/ingwe.log`
- **macOS**: `~/Library/Logs/com.lazylionconsulting.ingwestream/ingwe.log`

Level set to `Info` in `lib.rs`. Raise to `Debug` temporarily during investigation.

Key log lines to watch:

```text
init_service_webview: creating child webview logical_size=WxH
init_service_webview: child webview created and hidden
service webview init script loaded                            ← section 8 ping
on_page_load: injected media bridge for https://…            ← section-5 bridge ready
dispatch_media_key: eval ok action=play                      ← media key reached webview
dispatch_media_key: no active service for action=play        ← no service selected
open_service: id=<id> same_service=false                     ← navigation triggered
open_service: id=<id> same_service=true                      ← show-only, no reload
```
