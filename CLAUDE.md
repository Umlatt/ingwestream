# IngweStream — Claude CLI Master Context

IngweStream is a cross-platform desktop streaming consolidator. It wraps native OS webviews
(WebView2 / WKWebView / WebKitGTK) in a Tauri v2 shell with a custom OLED-dark React UI.
One persistent child webview renders the active streaming service; the shell handles the
system tray, media keys, window chrome, fullscreen mode, service switching, and notifications.

---

## Stack (exact versions)

| Layer         | Tech                     | Version                                  |
| ------------- | ------------------------ | ---------------------------------------- |
| Shell         | Tauri                    | 2.x (`unstable` feature for `add_child`) |
| Backend       | Rust / Cargo             | edition 2021                             |
| Frontend      | React                    | 19                                       |
| Language      | TypeScript               | ~5.8                                     |
| Styling       | Tailwind CSS v4          | 4.x (Vite plugin, no config file)        |
| UI primitives | shadcn/ui                | via `components.json`                    |
| Icons         | lucide-react             | 1.x                                      |
| State         | Zustand                  | 5.x                                      |
| Bundler       | Vite                     | 7.x                                      |
| Persistence   | tauri-plugin-store       | 2.x (`ingwe.json`)                       |
| Notifications | tauri-plugin-notification| 2.x                                      |
| HTTP (Rust)   | reqwest                  | 0.12                                     |

---

## Project layout

```text
ingwestream/
├── CLAUDE.md                      ← you are here
├── build-all.sh                   ← cross-platform release build script
├── .claude/
│   ├── frontend.md                ← UI system, component patterns, Tailwind tokens
│   ├── backend.md                 ← Rust commands, state, IPC, tray, shortcuts
│   └── windows-webview2.md        ← WebView2/wry threading model, known issues
├── src/                           ← React frontend
│   ├── main.tsx                   ← ReactDOM.createRoot (React.StrictMode ON)
│   ├── App.tsx                    ← Root layout: ResizeBorder + TitleBar + Sidebar + WebviewMount
│   ├── index.css                  ← Tailwind v4 @theme, custom tokens, animations
│   ├── components/
│   │   ├── TitleBar.tsx           ← Drag region, service label, cinema mode, window controls
│   │   ├── Sidebar.tsx            ← Fly-out panel, service list, settings button, backdrop
│   │   ├── WebviewMount.tsx       ← ServiceLauncher / ServicePause / native webview anchor
│   │   ├── ServiceWizard.tsx      ← Full-screen service picker, custom service support
│   │   └── ResizeBorder.tsx       ← Custom resize handles (8 fixed-position hit areas)
│   ├── store/
│   │   └── services.ts            ← Zustand store + useActiveServices() helper
│   ├── services/
│   │   └── serviceRegistry.ts     ← SERVICES array: id, label, url, faviconUrl, category
│   ├── lib/utils.ts               ← cn() = clsx + twMerge
│   └── assets/
├── src-tauri/
│   ├── tauri.conf.json            ← Window config, CSP, bundle
│   ├── Cargo.toml                 ← Dependencies
│   ├── capabilities/default.json  ← IPC permissions
│   └── src/
│       ├── lib.rs                 ← Builder: plugins, URI schemes, state, handler, setup, events
│       ├── main.rs                ← Binary entry (calls lib::run)
│       ├── commands.rs            ← All IPC handlers + resize helpers + media dispatch
│       ├── state.rs               ← AppState struct
│       ├── scripts.rs             ← WEBVIEW_DARK_INIT JS constant
│       ├── tray.rs                ← System tray: show/prev/play/next/quit
│       └── shortcuts.rs           ← Global media key + F11 registration
└── .github/
    └── copilot-instructions.md    ← VS Code Copilot context (separate from this file)
```

---

## Build & dev commands

```bash
# Full development session (Vite HMR + Tauri hot-reload)
npm run tauri:dev

# TypeScript check only (no output — fast pre-commit check)
npm run check

# Frontend bundle only (tsc + vite build)
npm run build

# Production build — current platform
npm run tauri:build

# Production build — Windows (cross-compile via cargo-xwin, from Linux)
npm run tauri:build:win

# Production build — Linux .deb
npm run tauri:build:linux

# Both targets via shell script
./build-all.sh

# Rust check only (fast, no link)
cd src-tauri && cargo check

# Rust lint
cd src-tauri && cargo clippy

# Run tests
cd src-tauri && cargo test
```

Dev server: `http://localhost:1420`   HMR websocket: `ws://localhost:1421`

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│  OS Window  (decorations=false, resizable, 1200×800 default)      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  TitleBar  h=32px  [drag-region]   [cinema] [min] [close]  │   │
│  ├───────────────────┬────────────────────────────────────────┤   │
│  │ Sidebar fly-out   │  WebviewMount                          │   │
│  │ (fixed, z-30)     │  (absolute inset-0)                    │   │
│  │ starts at top-8   │                                        │   │
│  │ in normal mode    │  ┌──────────────────────────────────┐  │   │
│  │                   │  │  Child Webview "service-view"    │  │   │
│  │                   │  │  (native WebView2/WKWebView)     │  │   │
│  │                   │  │  pos: (0,32) normal              │  │   │
│  │                   │  │  pos: (0,0)  fullscreen          │  │   │
│  └───────────────────┴──┴──────────────────────────────────┴──┘   │
└──────────────────────────────────────────────────────────────────┘
```

The child webview is a Tauri `Webview` added via `Window::add_child()` (requires the
`unstable` feature). It renders natively above the React tree — `WebviewMount` shows a
launcher grid when no service is active, or a "Paused" placeholder when the flyout is open
over an active service.

### Fullscreen (cinema) mode

`toggle_fullscreen_layout` emits `fullscreen-changed`. React collapses the titlebar to
`h-0`. The Rust `apply_resize_all` repositions the service webview to `(0, 0)` filling the
full window. Hovering the top edge flies in an overlay titlebar; hovering the left edge
flies in the sidebar. F11 global shortcut toggles fullscreen.

---

## IPC surface (frontend → backend)

| Command                    | Args                                   | Returns | Notes                                             |
| -------------------------- | -------------------------------------- | ------- | ------------------------------------------------- |
| `open_service`             | `serviceId: string, url: string`       | `void`  | Navigates child webview, shows it                 |
| `close_service`            | —                                      | `void`  | Hides webview; retained for reuse                 |
| `show_service_view`        | —                                      | `void`  | Shows child (flyout / wizard closed)              |
| `hide_service_view`        | —                                      | `void`  | Hides child (flyout / wizard open)                |
| `toggle_fullscreen_layout` | —                                      | `void`  | Toggles cinema mode; emits `fullscreen-changed`   |
| `apply_fullscreen_resize`  | —                                      | `void`  | Re-applies resize after React re-render           |
| `show_titlebar_overlay`    | `visible: boolean`                     | `void`  | Shows/hides overlay titlebar in fullscreen        |
| `update_window_icon`       | `faviconUrl: string`                   | `void`  | Fetches favicon bytes, sets taskbar icon          |
| `reset_window_icon`        | —                                      | `void`  | Restores default app icon                         |

All commands return `Result<(), AppError>` serialised as `{ message: string }` on error.

### URI scheme protocols (child webview → backend)

| Scheme            | Query params                                                            | Purpose                                          |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| `ingwe-ctrl://`   | `a=top-enter`, `top-leave`, `left-enter`, `left-leave`, `script-ready`  | Edge hover → overlay reveal; init diagnostic     |
| `ingwe-notify://` | `title=…&body=…`                                                        | Web Notification bridge → native OS notification |

---

## UI design system ▸ full detail in `.claude/frontend.md`

**Palette** (OLED — all from `index.css` `@theme`):

```text
bg:      base=#000  surface=#0a0a0a  elevated=#111  overlay=#1a1a1a  subtle=#222
border:  base=#2a2a2a  strong=#3a3a3a
text:    primary=#f0f0f0  secondary=#a0a0a0  muted=#606060  disabled=#404040
accent:  #4f86f7  hover=#6a9bf9  dim=#1a2f5a
danger:  #e05252  dim=#3b1818
radius:  sm=4px  md=8px  lg=12px
shadow:  float = 0 4px 24px rgba(0,0,0,0.8)
```

**Interaction conventions:**

- Hover: `hover:bg-bg-elevated hover:text-text-primary transition-colors duration-150`
- Active/selected: `bg-bg-overlay text-text-primary`
- Destructive hover: `hover:bg-danger`
- Loading bar: 2px bottom strip, `animate-loading-bar` (defined in `index.css`)
- Focus rings: `focus-visible:` only

---

## State management ▸ full detail in `.claude/frontend.md`

```ts
// src/store/services.ts — Zustand v5
interface ServicesState {
  activeId:       string | null;
  flyoutOpen:     boolean;
  isLoading:      boolean;       // true while open_service is in-flight
  isFullscreen:   boolean;       // driven by fullscreen-changed event
  wizardOpen:     boolean;
  enabledIds:     string[];      // persisted in ingwe.json; defaults to all services
  customServices: ServiceDefinition[];

  openService(service: ServiceDefinition): Promise<void>;
  closeService(): Promise<void>;
  openFlyout(): void;
  toggleFlyout(): void;
  closeFlyout(): void;
  toggleFullscreen(): Promise<void>;
  setFullscreen(value: boolean): void;
  openWizard(): void;            // hides service view + closes flyout
  closeWizard(): void;           // restores service view if active
  saveServiceConfig(enabledIds: string[], custom: ServiceDefinition[]): Promise<void>;
  initFromStore(): Promise<void>; // called once on App mount
}

// Derived selector — use instead of reading enabledIds/customServices directly
export function useActiveServices(): ServiceDefinition[]
```

---

## Adding a new streaming service

1. Add entry to `SERVICES` in `src/services/serviceRegistry.ts`:

   ```ts
   { id: "my-service", label: "My Service", url: "https://example.com",
     faviconUrl: fav("example.com"), category: "video" }
   ```

2. No other changes needed — the sidebar, launcher, and wizard all read from the store.

Service icons use the DuckDuckGo favicon API (`https://icons.duckduckgo.com/ip3/{domain}.ico`).
No lucide icon map exists; icons are `<img>` tags with `onError` fallback to Globe icon.

---

## Rust conventions

- Error type: `AppError` in `commands.rs` (derives `thiserror::Error + serde::Serialize`)
- State access: lock → clone/take what you need → drop lock before any I/O or eval
- Logging: `log::info!()` / `log::warn!()` / `log::error!()` — never `println!`
- New commands: add `pub fn`, `#[tauri::command]`, register in `lib.rs` invoke_handler,
  add permission to `capabilities/default.json`

---

## Windows-specific ▸ full detail in `.claude/windows-webview2.md`

- `add_child` is called **once** in `setup` via `init_service_webview` — never from a command handler
- `initialization_script` silently fails for child webviews on WebView2 — use `on_page_load`
  callback instead (guarded by `window.__ingweMediaInjected` flag)
- `RegisterHotKey` fires key-repeat at 40+ events/s — 300 ms per-action debounce in `dispatch_media_key`
- `set_focus()` returns `HRESULT(0x80070057)` on some services — made non-fatal (logs warning)
- `XGrabKey` panics on Linux/WSLg — wrapped in `std::panic::catch_unwind(AssertUnwindSafe(…))`

---

## CSP (`tauri.conf.json`)

```text
default-src 'self' tauri: asset:;
script-src  'self' 'unsafe-inline';
style-src   'self' 'unsafe-inline';
img-src     'self' data: asset: tauri: blob: https:;
connect-src 'self' ipc: http://ipc.localhost
```

`img-src https:` allows DuckDuckGo favicon images for service icons in the React UI.
The child webview navigates to external URLs and is **not** subject to this CSP.

---

## Capabilities (`capabilities/default.json`)

Window `main` has these permissions:

```text
core:default
opener:default
window-state:default
global-shortcut:allow-register / allow-unregister / allow-is-registered
core:window:allow-close / allow-minimize / allow-toggle-maximize
core:window:allow-start-dragging / allow-start-resize-dragging
core:window:allow-set-focus / allow-show / allow-hide / allow-set-icon
store:default
notification:default
```

When adding a new plugin, append its permission identifiers here.

---

## Window configuration (`tauri.conf.json`)

```json
{
  "title": "Ingwe",
  "width": 1200, "height": 800,
  "minWidth": 800, "minHeight": 600,
  "decorations": false,
  "resizable": true,
  "maximizable": false,
  "visible": false
}
```

`resizable: true` is required for `startResizeDragging` to work on Windows (`WS_THICKFRAME`).
`maximizable: false` prevents the window from covering the Windows taskbar when maximised
via keyboard shortcuts, which would block interaction with the OS shell.

---

## Do not touch

- `src-tauri/target/` — build artifacts
- `dist/` — Vite output, generated
- `src-tauri/gen/schemas/` — auto-generated Tauri JSON schemas
- `node_modules/` — dependencies
