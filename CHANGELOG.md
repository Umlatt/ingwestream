# Changelog

All notable changes to IngweStream are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-05-21

First stable release. IngweStream consolidates streaming services into one
native, OLED-dark desktop window built on Tauri v2.

### Shell & window

- Frameless Tauri v2 shell (1200×800 default, 800×600 minimum) with a custom
  React title bar and resize borders — no OS chrome.
- Custom title bar with menu toggle, active-service label, cinema mode toggle,
  minimise, **soft-maximise**, and close buttons.
- **Soft-maximise** that resizes the window to the monitor's work area without
  setting WS_MAXIMIZE — sidesteps the Windows taskbar compositor glitch
  ([tauri#7103](https://github.com/tauri-apps/tauri/issues/7103)) that draws a
  flat band where the taskbar should render under frameless maximised windows.
  Uses `windows-sys` `GetMonitorInfoW` to fetch the real work area.
- **True OS fullscreen** (cinema mode) via `window.set_fullscreen(true)`. The
  React title bar collapses, the child webview repositions to (0, 0), and the
  OS compositor properly hides the taskbar/menu bar.
- F11 toggles fullscreen globally. ESC exits fullscreen (handled both from the
  React UI and from inside the service webview via `ingwe-ctrl://?a=escape`).
- Cinema-mode edge-hover overlays — mouse near the top reveals a floating title
  bar; mouse near the left reveals the sidebar.
- Eight fixed-position resize hit areas at the window edges and corners.
- Window position, size, and visibility persisted via
  `tauri-plugin-window-state`.

### Service consolidation

- 39 built-in streaming services across video (Netflix, Disney+, Prime Video,
  YouTube, Hulu, Max, Paramount+, Peacock, Crunchyroll, BBC iPlayer, ITVX, …)
  and music (Spotify, YouTube Music, Apple Music, Amazon Music, Tidal, Deezer,
  SoundCloud, Pandora, …).
- One persistent child webview (Tauri `Webview` via `Window::add_child`)
  navigates between services via `eval('location.href = …')` — services keep
  their isolated cookies, localStorage, and login state for the lifetime of
  the app process.
- **Custom services** — users can add arbitrary URLs and pick `video` or
  `music` as the category so the new service slots into the correct launcher
  pane. Inline editing and deletion in the wizard.
- Active services are sorted alphabetically by label across built-in and
  custom entries.
- Service icons fetched live from the DuckDuckGo favicon API
  (`https://icons.duckduckgo.com/ip3/{domain}.ico`) with a Lucide `Globe`
  fallback on load failure.

### Launcher / startup screen

- Hero header with the project logo (`./media/logo.png`, accent-tinted
  drop-shadow), app name pulled live from `@tauri-apps/api/app#getName()`, and
  a tagline.
- Two equal-height panes (Video, Music), each independently scrollable,
  separated only by a hairline-framed section title.
- Services rendered as **bare-icon buttons** — no card chrome, just the
  favicon centred in a uniform `size-24` cell. Buttons scale on hover
  (`hover:scale-110`) and depress on press.
- Favicons display at their natural pixel size (capped at `max-w-10 max-h-10`)
  so small native icons never upscale into a blurry larger size.
- Icon groups are **centred horizontally and vertically** inside their pane;
  scroll kicks in only when content exceeds the pane height.
- Footer strip with version (from `getVersion()`) and *brought to you by Lazy
  Lion Consulting* credit.

### Settings wizard

- Full-screen wizard that opens on first run or via the sidebar's Settings
  link. Refuses to close until at least one service is selected.
- Hero header matching the launcher (same logo, app name, tagline) for visual
  continuity, with the close X repositioned to the top-right.
- **Hairline-framed section dividers** (Video / Music / Custom) matching the
  launcher's pane titles.
- Right-aligned, compact "Continue with N service(s)" button in the footer.
- Selection state shown with an accent-coloured ring and check badge in the
  card corner.
- Custom-service add form with URL + label inputs and a **Video / Music
  category picker** so new services land in the correct launcher pane.
- Edit panel and hover-toolbar trash button on each custom card.

### Sidebar flyout

- 208 px panel that slides in from the left, starting below the title bar in
  windowed mode and at the top of the screen in fullscreen.
- Click-anywhere-outside or 600 ms `onMouseLeave` (fullscreen only) closes it.
- Edge-hover (left 4 px) opens the flyout in fullscreen mode.
- **Right-click** any service item to navigate the webview back to that
  service's default URL — useful when a user is lost deep inside a service.

### Loading / paused states

- Loading overlay that mirrors the pause overlay's layout — favicon + label +
  pulsing "Loading" caption — so picking a new service from the flyout
  transitions smoothly between the two states instead of jumping to a
  big-spinner UI.
- 2 px sliding loading bar (`animate-loading-bar`) along the bottom of the
  title bar during navigation. Triggered by Rust's `on_page_load(Started)` and
  cleared by `on_page_load(Finished)` via the `service-load-started` /
  `service-load-finished` Tauri events.
- `ServicePause` placeholder when the flyout is open over an active service,
  so the content area doesn't read as a black void behind the sidebar.

### Media keys

- Global hotkeys for `MediaPlayPause`, `MediaTrackNext`, `MediaTrackPrevious`,
  `MediaStop` via `tauri-plugin-global-shortcut`. F11 also registered for
  fullscreen.
- **MediaSession integration** — the dark-mode init script hooks
  `navigator.mediaSession.setActionHandler` and captures every handler each
  service registers. When a hardware media key fires,
  `window.__ingweMedia(action)` invokes the captured handler directly — the
  same path a normal browser would take. Works for Spotify, YouTube Music,
  Apple Music, Amazon Music, Tidal, Deezer, SoundCloud, and any other site
  using the Media Session API.
- Click-button fallbacks for sites without MediaSession (Spotify
  `data-testid` selectors, YouTube Music shadow-DOM controls).
- Shift+N / Shift+P keyboard-event fallbacks for YouTube Music.
- 300 ms per-action debounce in `dispatch_media_key` to absorb Windows
  `RegisterHotKey` key-repeat spam (40+ events/s).
- All registrations wrapped in `std::panic::catch_unwind` so a Linux/WSLg
  `XGrabKey` panic when the desktop environment owns the key doesn't bring
  the app down — registrations soft-fail with a warning.

### Dark mode & webview integration

- `WEBVIEW_DARK_INIT` JS injected on every service navigation, gated by a
  `window.__ingweMediaInjected` flag so the script never double-runs.
  Injected via both `initialization_script` (works on Linux/macOS) and
  `on_page_load(Finished)` (the reliable path on Windows/WebView2, where
  `AddScriptToExecuteOnDocumentCreated` silently fails for child webviews).
- The init script:
  1. Adds `<meta name="color-scheme" content="dark">` and a baseline dark
     style sheet.
  2. Overrides `window.matchMedia('(prefers-color-scheme: dark)')` to return
     a plain object with `matches: true` (so MUI / YTM's `Object.assign` on
     the result doesn't `TypeError`).
  3. Hooks `navigator.mediaSession.setActionHandler` (see *Media keys*).
  4. Bridges `window.Notification` to native OS notifications via
     `ingwe-notify://`.
  5. Captures physical media key keydown events via `capture: true`.
  6. Detects mouse near the top / left window edges and pings
     `ingwe-ctrl://?a=top-enter` etc. so React can fly in the overlays in
     fullscreen mode.
  7. Captures ESC and pings `ingwe-ctrl://?a=escape` so fullscreen can be
     exited even when the service webview has keyboard focus.

### Tray

- System tray icon with a menu: Show IngweStream / Previous / Play-Pause /
  Next / — / Quit.
- Left-click on the tray icon restores the window from minimised
  (`unminimize` + `show` + `set_focus` — Windows `show` alone uses `SW_SHOW`
  not `SW_RESTORE`, so doesn't undo a minimise).
- Tray icon updates to the active service's favicon via
  `update_window_icon(faviconUrl)` whenever a service is opened; restored to
  the default app icon on close.

### Notifications

- `tauri-plugin-notification` for native OS notifications.
- In-webview `window.Notification` calls are bridged to the native plugin via
  the `ingwe-notify://` URI scheme — services that show desktop notifications
  get the OS-native experience automatically.

### Persistence

- `tauri-plugin-store` persists `enabledIds`, `customServices`, and `firstRun`
  to `ingwe.json` in the app's config directory.
- `tauri-plugin-window-state` persists window bounds and visibility across
  sessions.

### Cross-platform builds

- `npm run tauri:dev` — full dev with Vite HMR.
- `npm run tauri:build` — current platform.
- `npm run tauri:build:win` — Windows MSI via `cargo-xwin` cross-compile from
  Linux.
- `npm run tauri:build:linux` — Linux `.deb`.
- `./build-all.sh` builds both Windows and Linux artefacts in one go.
- Cross-platform: Windows (WebView2), Linux (WebKitGTK), macOS (WKWebView).

### IPC surface (frontend → backend)

| Command | Purpose |
|---|---|
| `open_service` | Navigate child webview to a service URL (skips reload if same service is already active) |
| `reset_service` | Force-navigate to a service URL even when it's the active service — right-click reset |
| `close_service` | Hide the child webview (keeps it alive for reuse) |
| `show_service_view` / `hide_service_view` | Show/hide the child without changing active state |
| `toggle_fullscreen_layout` | Toggle cinema mode + OS fullscreen, emit `fullscreen-changed` |
| `apply_fullscreen_resize` | Re-apply resize after React re-renders |
| `show_titlebar_overlay` | Show/hide the floating title bar overlay in fullscreen |
| `update_window_icon` | Fetch favicon bytes via `reqwest`, set as window icon |
| `reset_window_icon` | Restore default app icon |
| `get_work_area` | Return current monitor's work area (Win32 `GetMonitorInfoW` on Windows; full monitor size as fallback) |

### URI schemes (child webview → backend)

| Scheme | Purpose |
|---|---|
| `ingwe-ctrl://?a=…` | Edge-hover (`top-enter`, `top-leave`, `left-enter`, `left-leave`), `escape` to exit fullscreen, `script-ready` init diagnostic |
| `ingwe-notify://?title=…&body=…` | Web Notification → native OS notification bridge |

### Architecture notes

- The child webview is created **exactly once** in `setup` via
  `init_service_webview` on the Win32 main thread. Calling `add_child` from a
  Tokio command handler causes wry's `wait_with_pump` to re-enter and deadlock
  under WebView2's COM STA model.
- Service switching is `v.eval('location.href = …')` + `v.show()` — fast,
  thread-safe, no webview re-creation.
- `set_focus()` failures (HRESULT `0x80070057` on some services like
  Crunchyroll) are logged as warnings rather than propagated.
- All Rust state access follows lock → clone/take → drop → do I/O.

### Stack

- Tauri 2.x (`unstable` feature for `Window::add_child`, `devtools`,
  `tray-icon`, `image-png`, `image-ico`).
- Rust 2021 edition with `thiserror`, `serde`, `reqwest 0.12`, `log 0.4`,
  `tokio 1`.
- `windows-sys 0.59` as a Windows-only target dep for `GetMonitorInfoW`.
- React 19, TypeScript ~5.8, Tailwind CSS v4 (no config file — theme in
  `@theme` block in `index.css`), Vite 7.
- Zustand 5 for state, lucide-react for icons, `clsx` + `tailwind-merge` via
  a `cn()` helper.
