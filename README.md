<div align="center">

<img src="./media/banner.png" alt="Ingwe banner" width="100%" />

# 🐆 Ingwe

**Ultra-lightweight, cross-platform streaming service consolidator**

*One window. Every stream. Zero compromise.*

[![Build](https://img.shields.io/github/actions/workflow/status/lazy-lion-consulting/ingwestream/build.yml?branch=main&style=flat-square&logo=github&label=build)](https://github.com/lazy-lion-consulting/ingwestream/actions)
[![Version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)](https://github.com/lazy-lion-consulting/ingwestream/releases)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-2021-orange?style=flat-square&logo=rust)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-lightgrey?style=flat-square&logo=linux)](https://github.com/lazy-lion-consulting/ingwestream)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)

</div>

---

## What is Ingwe?

Ingwe (Zulu: *leopard*) is a native desktop application that consolidates all your streaming services — Netflix, Disney+, Spotify, YouTube, and more — into a single, unified window with a common control surface.

Built on **Tauri v2** (Rust + OS native webviews), Ingwe is not an Electron app. It uses the OS-native rendering engine directly, keeping the binary small and memory usage a fraction of running each service in a dedicated browser window. Background service webviews are aggressively throttled to near-zero CPU/RAM when out of focus, making it viable to keep every service "open" simultaneously without performance penalty.

---

## Features

|     | Feature                          | Details                                                                                              |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 🪟  | **Single-window consolidation**  | 39 built-in streaming services in one frameless, OLED-dark window                                    |
| 🎨  | **Modern startup screen**        | Logo hero, two equal-height panes (Video / Music), centred bare-icon services with native pixel size |
| ➕   | **Custom services**              | Add any URL with a Video / Music category picker; alphabetic merge with the built-ins                |
| 🔄  | **Right-click reset**            | Right-click a service in the flyout to navigate back to its default URL                              |
| 🦀  | **Native performance**           | Tauri v2 + Rust core; no Chromium bundled                                                            |
| 🎬  | **Cinema mode**                  | True OS-level fullscreen via `set_fullscreen`; edge-hover reveals title bar + sidebar                |
| 🖥️  | **Soft maximise**                | Custom maximise resizes to the monitor's work area without WS_MAXIMIZE (fixes tauri#7103)            |
| 🎵  | **Global media keys**            | OS media keys hooked into `navigator.mediaSession.setActionHandler` — works on every modern site     |
| 🔒  | **Widevine DRM**                 | Full L1/L3 DRM support via platform-native webview engines                                           |
| 🌑  | **Strict OLED dark mode**        | OLED-black theme injected into every service webview, including `matchMedia` override                |
| 📺  | **HLS / DASH / WebRTC**          | Full HTML5 adaptive streaming stack                                                                  |
| 🔔  | **Notification bridge**          | In-webview `Notification` API routed to native OS notifications                                      |
| 🗂️  | **System tray**                  | Playback controls and quick-switch from the tray icon                                                |
| 💾  | **Persistent sessions**          | Each service keeps its own isolated login session (cookies, localStorage)                            |
| 🌍  | **Cross-platform**               | Linux (WebKitGTK), Windows (WebView2), macOS (WKWebView)                                             |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell / IPC | [Tauri v2](https://tauri.app) (Rust) |
| UI Framework | [React 19](https://react.dev) + [TypeScript 5.8](https://www.typescriptlang.org) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| Build Tool | [Vite 7](https://vitejs.dev) |
| Webview Engines | WebView2 (Win) · WKWebView (macOS) · WebKitGTK (Linux) |
| Tray | `tauri-plugin-tray` |
| Media Keys | `tauri-plugin-global-shortcut` |
| State | `tauri-plugin-window-state` |

---

## Screenshots

> *Coming soon — first stable UI in Milestone 1.*

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs) (stable toolchain)
- [Node.js](https://nodejs.org) ≥ 20
- Platform webview runtime:
  - **Linux:** `webkit2gtk-4.1` + `libsoup-3.0` + `libjavascriptcoregtk-4.1`
  - **Windows:** WebView2 runtime (pre-installed on Win 11; [download for Win 10](https://developer.microsoft.com/en-us/microsoft-edge/webview2/))
  - **macOS:** Built-in (WKWebView)

### Install

```bash
git clone https://github.com/lazy-lion-consulting/ingwestream.git
cd ingwestream
npm install
```

### Development

```bash
npm run tauri dev
```

### Production Build

```bash
npm run tauri build
```

Output artifacts land in `src-tauri/target/release/bundle/`.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Ingwe Shell (React)                │
│  ┌──────────┐  ┌───────────────────────────────────┐│
│  │ Sidebar  │  │        WebviewSlot (active)        ││
│  │ (tabs)   │  │   ┌─────────────────────────────┐ ││
│  │          │  │   │  OS Native Webview (service) │ ││
│  │ Netflix  │  │   │  + dark-theme init script    │ ││
│  │ Spotify  │  │   │  + __ingweMedia bridge       │ ││
│  │ Disney+  │  │   └─────────────────────────────┘ ││
│  │  ...     │  └───────────────────────────────────┘│
│  └──────────┘                                        │
└──────────────────────┬──────────────────────────────┘
                       │ Tauri IPC (invoke)
┌──────────────────────▼──────────────────────────────┐
│                  Rust Core (lib.rs)                  │
│  AppState · WebviewWindow pool · Throttle engine     │
│  Tray · Global shortcuts · Media key dispatch        │
└─────────────────────────────────────────────────────┘
```

**Webview lifecycle:** `active` → *(switch away)* → `suspended` *(800ms grace)* → *(10min idle)* → `destroyed`

---

## Roadmap

- [ ] **M0** — Project scaffold, toolchain, blank frameless window
- [ ] **M1** — OLED theme foundation, sidebar shell, shadcn/ui integration
- [ ] **M2** — Rust `AppState` IPC: `open_service`, `switch_service`, `close_service`
- [ ] **M3** — WebviewWindow engine + dark-mode injection per service
- [ ] **M4** — System tray, global media keys, SMTC/MPRIS bridge
- [ ] **M5** — Throttling engine: freeze/resume scripts, GC, memory budgets
- [ ] **M6** — Widevine DRM validation (Netflix, Disney+, etc.)
- [ ] **M7** — Packaging: AppImage, NSIS/MSI, dmg + auto-updater

---

## Project Structure

```
ingwestream/
├── src/                        # React + TypeScript frontend
│   ├── components/             # UI components (shadcn/ui + custom)
│   ├── hooks/                  # Custom React hooks
│   ├── services/               # Service config & URL registry
│   ├── store/                  # App state (Zustand / context)
│   └── utils/
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # Tauri app builder, plugin registration
│   │   └── main.rs             # Binary entry point
│   ├── icons/                  # App icons (all platforms)
│   ├── capabilities/           # Tauri v2 permission manifests
│   └── tauri.conf.json         # App config
├── .github/
│   ├── prompts/                # AI knowledge-routing prompt files
│   │   ├── ui.prompt.md        # Tailwind v4 / shadcn / dark-mode rules
│   │   ├── backend.prompt.md   # IPC / tray / media key patterns
│   │   └── performance.prompt.md # Throttling & memory optimization
│   └── copilot-instructions.md
└── package.json
```

---

## Development Conventions

- **Dark mode only** — `class="dark"` on root, no `dark:` prefixes, no light-mode variants.
- **OLED palette** — `#000000` base, `#0a0a0a` surface. No `bg-white` / `text-black`.
- **IPC pattern** — All Rust commands return `Result<T, AppError>`. All errors are `thiserror`-derived and serialisable.
- **No Electron** — If you're reaching for `ipcRenderer`, you're in the wrong repo.

---

## IDE Setup

[VS Code](https://code.visualstudio.com/) with:
- [Tauri extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)

---

## Contributing

Contributions are welcome. Please open an issue before submitting a pull request for significant changes.

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit with conventional commits: `feat:`, `fix:`, `perf:`, `chore:`
4. Open a PR against `main`

---

## License

MIT © [Lazy Lion Consulting](https://github.com/lazy-lion-consulting)
