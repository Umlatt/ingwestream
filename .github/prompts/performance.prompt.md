---
applyTo: "src-tauri/src/**/*.rs,src/**/*.{ts,tsx}"
---

# Performance Domain: Webview Throttling · Resource Control · Memory Optimization

## Core Throttling Model

**Rule:** Any WebviewWindow not currently visible to the user must consume near-zero CPU.  
**Three-tier lifecycle:** `active` → `suspended` → `destroyed`

| State | Visibility | JS Timers | Rendering | Audio | Trigger |
|---|---|---|---|---|---|
| `active` | visible | running | full | allowed | user switches to it |
| `suspended` | hidden | frozen | none | muted | user switches away |
| `destroyed` | gone | — | — | — | memory pressure / manual close |

---

## Rust-Side Throttling

### Suspend a background WebviewWindow

```rust
/// Freeze JS execution and hide rendering pipeline for an idle webview.
pub fn suspend_webview(wv: &tauri::WebviewWindow) -> tauri::Result<()> {
    // 1. Hide the window (stops GPU compositing)
    wv.hide()?;
    // 2. Inject JS timer freeze
    wv.eval(SUSPEND_SCRIPT)?;
    Ok(())
}

/// Restore a suspended webview to active state.
pub fn resume_webview(wv: &tauri::WebviewWindow) -> tauri::Result<()> {
    wv.eval(RESUME_SCRIPT)?;
    wv.show()?;
    wv.set_focus()?;
    Ok(())
}
```

### Auto-destroy under memory pressure

```rust
use std::time::{Duration, Instant};

pub struct WebviewEntry {
    pub window: tauri::WebviewWindow,
    pub last_active: Instant,
    pub state: WebviewState,
}

#[derive(PartialEq)]
pub enum WebviewState { Active, Suspended, Destroyed }

/// Call on a background timer (e.g., every 60s).
pub fn gc_idle_webviews(state: &mut AppState) {
    let cutoff = Duration::from_secs(600); // 10-min idle → destroy
    let now = Instant::now();
    let to_destroy: Vec<String> = state.entries
        .iter()
        .filter(|(id, e)| {
            Some(id.as_str()) != state.active_service.as_deref()
                && e.state == WebviewState::Suspended
                && now.duration_since(e.last_active) > cutoff
        })
        .map(|(id, _)| id.clone())
        .collect();

    for id in to_destroy {
        if let Some(e) = state.entries.remove(&id) {
            let _ = e.window.close(); // drops OS webview resources
        }
    }
}
```

---

## JS Throttle Scripts

### `SUSPEND_SCRIPT` — freeze all timer activity

```js
// SUSPEND_SCRIPT — executed in the background webview
(function() {
  if (window.__ingweSuspended) return;
  window.__ingweSuspended = true;

  // Override timer APIs to no-op
  window.__origSetInterval  = window.setInterval;
  window.__origSetTimeout   = window.setTimeout;
  window.__origRAF          = window.requestAnimationFrame;

  window.setInterval  = () => -1;
  window.setTimeout   = () => -1;
  window.requestAnimationFrame = () => -1;

  // Suspend Web Audio (if active)
  if (window.__ingweAudioCtx) {
    window.__ingweAudioCtx.suspend?.();
  }

  // Mute all media elements
  document.querySelectorAll('video, audio').forEach(el => {
    el.__ingwePrevMuted = el.muted;
    el.muted = true;
    el.pause?.();
  });

  // Disconnect IntersectionObserver / ResizeObserver to reduce callbacks
  window.__ingweObservers?.forEach(o => o.disconnect());
})();
```

### `RESUME_SCRIPT` — restore timer activity

```js
// RESUME_SCRIPT — executed on webview becoming active
(function() {
  if (!window.__ingweSuspended) return;
  window.__ingweSuspended = false;

  // Restore timer APIs
  if (window.__origSetInterval)  window.setInterval  = window.__origSetInterval;
  if (window.__origSetTimeout)   window.setTimeout   = window.__origSetTimeout;
  if (window.__origRAF)          window.requestAnimationFrame = window.__origRAF;

  // Resume Web Audio
  if (window.__ingweAudioCtx) {
    window.__ingweAudioCtx.resume?.();
  }

  // Unmute media that was previously unmuted
  document.querySelectorAll('video, audio').forEach(el => {
    el.muted = el.__ingwePrevMuted ?? false;
  });

  // Reconnect observers
  window.__ingweObservers?.forEach(o => o.observe(document.body));
})();
```

---

## Delayed Suspension (Grace Period)

Never suspend immediately on tab switch — services may be mid-navigation.

```rust
use tokio::time::{sleep, Duration};

pub async fn schedule_suspend(app: tauri::AppHandle, service_id: String) {
    sleep(Duration::from_millis(800)).await; // grace: 800ms
    if let Some(state) = app.try_state::<Mutex<AppState>>() {
        let mut s = state.lock().unwrap();
        // Only suspend if still not active
        if s.active_service.as_deref() != Some(&service_id) {
            if let Some(entry) = s.entries.get_mut(&service_id) {
                let _ = suspend_webview(&entry.window);
                entry.state = WebviewState::Suspended;
            }
        }
    }
}
```

Spawn from `switch_service` command:
```rust
tauri::async_runtime::spawn(schedule_suspend(app.clone(), prev_id));
```

---

## Window Visibility Optimization

**Do not use `wv.set_visible_on_all_workspaces(false)`** — it prevents GPU layer reuse.

**Use `wv.hide()` not `wv.minimize()`** — minimize still composites on some platforms.

**Platform-specific notes:**
- **Linux/WebKitGTK:** `hide()` suspends rendering but JS may still run — always pair with `SUSPEND_SCRIPT`.
- **Windows/WebView2:** Hidden windows fully pause rendering and throttle JS; `SUSPEND_SCRIPT` adds extra freeze.
- **macOS/WKWebView:** `hide()` is insufficient alone — must call `wv.eval(SUSPEND_SCRIPT)`.

---

## Memory Budget Targets

| Scenario | Target RAM (per suspended wv) | CPU % |
|---|---|---|
| Single active service | < 50 MB overhead | 0% from hidden wvs |
| 3 services (1 active) | < 30 MB each suspended | < 0.1% total bg |
| 6 services (1 active) | Auto-destroy LRU beyond 5 | < 0.1% total bg |

**Destroy threshold:** > 5 suspended webviews OR any single webview idle > 10 min.

---

## React-Side Performance Guards

```tsx
// Prevent React re-renders from triggering layout in unmounted webview containers
const WebviewSlot = React.memo(({ serviceId, isActive }: { serviceId: string; isActive: boolean }) => {
  return (
    <div
      id={`webview-mount-${serviceId}`}
      className="absolute inset-0"
      style={{ visibility: isActive ? 'visible' : 'hidden', contain: 'strict' }}
    />
  );
});
```

- `contain: strict` prevents off-screen layout calculations.
- `visibility: hidden` preferred over `display: none` for webview containers — avoids DOM detach.

---

## IPC Commands for Throttle Control

```rust
#[tauri::command]
pub fn throttle_service(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    service_id: String,
    enable: bool,
) -> Result<(), AppError> {
    let s = state.lock().map_err(|_| AppError::StatePoisoned)?;
    let entry = s.entries.get(&service_id).ok_or_else(|| AppError::WebviewNotFound(service_id.clone()))?;
    if enable {
        entry.window.eval(SUSPEND_SCRIPT).map_err(AppError::from)
    } else {
        entry.window.eval(RESUME_SCRIPT).map_err(AppError::from)
    }
}
```

---

## Profiling Reference

```bash
# Linux — monitor per-process GPU memory
cat /sys/class/drm/card*/clients/*/name

# macOS
sudo footprint -j ingwe

# Windows — WebView2 memory in Task Manager: "Ingwe (WebView2)"

# Tauri devtools (development only)
# Enable in Cargo.toml: tauri = { features = ["devtools"] }
# Access: right-click webview → Inspect
```
