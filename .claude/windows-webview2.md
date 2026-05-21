# IngweStream — Windows WebView2 Threading Model & Known Issues

## Architecture summary

On Windows, Tauri uses **wry** which uses **WebView2** (Chromium-based, via EdgeHTML COM API).
WebView2 is a COM Single-Threaded Apartment (STA) component. All WebView2 creation must be
done on a thread that is pumping Win32 messages.

wry's `new_as_child` / `new_in_hwnd` call chain:

```text
new_in_hwnd()
  → CoInitializeEx(COINIT_APARTMENTTHREADED)
  → CreateWindowExW(...)              // create container HWND
  → create_environment(...)           // async; waits via wait_with_pump(rx)
  → create_controller(hwnd, ...)      // async; waits via wait_with_pump(rx)
  → init_webview(...)                 // sync setup
```

`wait_with_pump` pumps the calling thread's Win32 message queue via
`MsgWaitForMultipleObjectsEx` + `PeekMessage` + `DispatchMessage` until the COM
completion callback fires.

---

## Solution: pre-create in `setup`, navigate via `eval()`

`add_child` is called **exactly once**, during `setup`, before any WebView2 IPC traffic.
The child webview starts on `about:blank` and is immediately hidden. Service switching
navigates it via `eval()`:

```rust
// In setup (Win32 main thread, clean message pump):
commands::init_service_webview(&app.handle())?;

// open_service command (any thread — no COM work):
v.eval(&format!("window.location.href = {url_json};"))?;
v.show()?;
if let Err(e) = v.set_focus() {
    log::warn!("open_service: set_focus failed (non-fatal): {e}");
}
```

`eval()` posts the script asynchronously and returns immediately. Safe from any thread.
`close_service` **hides** the webview (does not destroy it).

---

## Rule 1 — Call `add_child` only from `setup`

**Never call `add_child` from a `#[tauri::command]` handler or Tokio thread.**

Command handlers run on Tokio worker threads. `wait_with_pump` on a background thread
pumps the *main thread's* message queue cross-thread, interfering with in-flight WebView2
IPC events. Even via `run_on_main_thread`, calling `add_child` inside an active WebView2
IPC callback causes reentrant `wait_with_pump` that can hang indefinitely.

The only safe context is `setup`:

- Runs on the Win32 main thread.
- Runs before the event loop starts — no WebView2 IPC events in flight.
- Clean message pump.

---

## Rule 2 — Never pass `.data_directory()` to `WebviewBuilder`

`.data_directory()` forces `CreateCoreWebView2EnvironmentWithOptions` with a specific
user-data path, adding a second async `wait_with_pump` chain. Without it, wry reuses the
default environment, skipping that step entirely.

---

## Known issue: `initialization_script` silently fails for child webviews

**Symptom**: `initialization_script(WEBVIEW_DARK_INIT)` is set on the `WebviewBuilder`,
but `window.__ingweMedia` is undefined after page load; the `script-ready` diagnostic ping
never appears in logs.

**Root cause**: On Windows/WebView2, `AddScriptToExecuteOnDocumentCreated` is not called
for child webviews created via `add_child`. This is a wry/WebView2 bug.

**Fix**: The `on_page_load(PageLoadEvent::Finished)` callback is the reliable injection
path. The `initialization_script` call is kept as belt-and-suspenders for non-Windows
platforms and future wry fixes.

Injection guard prevents double-execution:

```js
if (!window.__ingweMediaInjected) {
  window.__ingweMediaInjected = true;
  // … WEBVIEW_DARK_INIT body …
}
```

Log line confirming injection:

```text
on_page_load: injected media bridge for https://…
```

If this line is absent for a service, the media bridge is not installed and media keys
will not work.

---

## Known issue: `RegisterHotKey` key-repeat spam

**Symptom**: On Windows, holding a media key fires 40+ `WM_HOTKEY` messages per second.
`dispatch_media_key` is called each time, causing rapid-fire `eval()` calls.

**Fix**: 300 ms per-action debounce using `OnceLock<Mutex<HashMap<String, Instant>>>`.

```rust
static MEDIA_DEBOUNCE: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
const DEBOUNCE_MS: u64 = 300;
```

Each call to `dispatch_media_key` checks the last dispatch time per action string and
returns early if under 300 ms. The map is initialised lazily on first use.

---

## Known issue: `set_focus()` fails on some services

**Symptom**: `open_service` call completes but returns a Tauri error log:

```text
open_service: set_focus failed (non-fatal): WebView2 error: WindowsError(Error { code: HRESULT(0x80070057) })
```

This has been observed on Crunchyroll. The service still opens and is navigable.

**Fix**: `set_focus()` is called but the error is caught and logged as a warning rather
than propagated as an `AppError`. The service view is shown regardless.

---

## Known issue: Global shortcut registration panics on Linux/WSLg

**Symptom**: Calling `app.global_shortcut().on_shortcut("MediaPlayPause", …)` panics
with an `XGrabKey` error when the desktop environment has claimed the media keys.

**Fix**: Every shortcut registration is wrapped in `std::panic::catch_unwind(AssertUnwindSafe(…))`:

```rust
let result = panic::catch_unwind(AssertUnwindSafe(|| {
    app.global_shortcut().on_shortcut(key, move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            dispatch_media_key(&handle, &action_str);
        }
    })
}));
match result {
    Ok(Ok(_))  => { registered += 1; }
    Ok(Err(e)) => log::warn!("could not register {key}: {e}"),
    Err(_)     => log::warn!("{key} panicked during registration (likely grabbed by DE)"),
}
```

Setup continues with however many shortcuts registered successfully (0 is acceptable).

---

## `wait_with_pump` internals (wry source, schematic)

```rust
pub fn wait_with_pump<T>(rx: Receiver<T>) -> Result<T> {
    let mut msg = MSG::default();
    loop {
        match rx.try_recv() {
            Ok(result) => return result,
            Err(_) => {
                MsgWaitForMultipleObjectsEx(0, None, TIMEOUT, QS_ALLINPUT, MWMO_INPUTAVAILABLE);
                while PeekMessageW(&mut msg, HWND::default(), 0, 0, PM_REMOVE) {
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);   // ← dispatches ALL window messages, including
                                              //   winit run_on_main_thread user-events
                }
            }
        }
    }
}
```

This is why calling `add_child` inside any active WebView2 IPC handler is unsafe — the
`DispatchMessageW` loop can re-enter the same handler context.

---

## Resize architecture

The child webview is repositioned by `apply_resize_all` whenever:

- The OS window is resized (`on_window_event(Resized)`)
- Fullscreen is toggled (`toggle_fullscreen_layout` / `toggle_fullscreen_from_shortcut`)
- A titlebar/sidebar overlay appears/disappears (`show_titlebar_overlay`)
- React requests a re-apply after `fullscreen-changed` (`apply_fullscreen_resize`)

Position is always in **logical pixels** using `LogicalPosition` + `LogicalSize`, so DPI
scaling is handled automatically by wry.

```text
Normal:      pos=(0, 32),      size=(w, h-32)
Fullscreen:  pos=(0, 0),       size=(w, h)
FS+titlebar: pos=(0, 32),      size=(w, h-32)
FS+sidebar:  pos=(208, 0),     size=(w-208, h)
FS+both:     pos=(208, 32),    size=(w-208, h-32)
```

---

## Diagnostic procedure (Windows)

1. Build: `npm run tauri:build` (or `./build-all.sh`).
2. Run `.exe`. Open logs at `%LOCALAPPDATA%\com.lazylionconsulting.ingwestream\logs\ingwe.log`.
3. On startup confirm both:
   - `init_service_webview: creating child webview logical_size=WxH`
   - `init_service_webview: child webview created and hidden`
4. Select a service. Confirm:
   - `open_service: id=<id> same_service=false`
   - `on_page_load: injected media bridge for https://…`
   - `service webview init script loaded`
5. Press a media key. Confirm `dispatch_media_key: eval ok action=<action>`.
6. If `init_service_webview` stops at "creating…" → `add_child` hung (see Rule 1).
7. If `open_service` returns "service webview not initialized" → init failed in setup.
8. If `dispatch_media_key: no active service` → media key pressed before any service selected.
9. If `on_page_load: inject failed` → `eval()` error; check for CSP or WebView2 issues.

---

## Window configuration notes

- `decorations: false` — React renders the custom titlebar. `data-tauri-drag-region`
  enables OS-level window dragging.
- `resizable: true` — required for `WS_THICKFRAME`, which `startResizeDragging` needs
  to send `WM_SYSCOMMAND(SC_SIZE)`.
- `maximizable: false` — prevents `decorations: false` windows from maximising over the
  taskbar (a known Windows behaviour where frameless maximised windows cover the work area).
- `visible: false` — window shown programmatically in `setup` after state is ready.
- DPI: Tauri handles DPI scaling; always use logical pixels for child webview positioning.
- WebView2 devtools: press F12 inside the child webview in dev builds (`devtools` feature).
