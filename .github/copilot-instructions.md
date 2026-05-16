# Ingwe Stream: Workspace Instructions

## 1. Architecture & Tech Stack
- **Core:** Rust (Backend), Tauri v2, TypeScript, React/Svelte/Vue, Tailwind CSS, headless UI (shadcn/ui).
- **WebViews:** Native OS webviews (WebView2, WKWebView, WebKitGTK).

## 2. UI & Identity
- **Name:** Ingwe Stream
- **Theme:** Strict Dark Mode (deep grays, OLED blacks). No light mode. Tailwind `class` strategy.
- **WebViews:** Force dark mode via `prefers-color-scheme: dark`. Inject custom CSS/JS on init if native support fails.

## 3. Core Functionality
- **Services:** Netflix, Prime, Disney+, Plex, Jellyfin, Apple TV, + Custom URLs (fetch favicons).
- **Sessions:** Preserve cookies, local storage, and session data across restarts.
- **Resource Management:** Aggressively throttle, pause, or hide background webviews when out of focus.

## 4. OS Integration
- **Tray:** `tauri-plugin-tray` with playback controls.
- **Media Controls:** OS-level integration (SMTC, MPRIS). Route media keys to active webview.
- **DRM & Codecs:** Widevine DRM support. Enable flags for WebView2/WebKitGTK. Support HTML5, HLS, DASH, WebRTC.

## 5. Token Efficiency & Context Limits
- **Context Filtering:** Do not automatically ingest build artifacts (`target/`, `dist/`), generated files, massive `.json` files, or logs. Limit scope purely to actively modified components.
- **Direct Output:** Eliminate conversational filler, redundant step-by-step reasoning, and repetitive pleasantries in your output.
- **Tool Discipline:** Minimize repetitive file-reading loops. Aggregate data extraction into single, concise steps.

## 6. Developer Workflow
- **Structure:** Modular logic (`components`, `hooks`, `services`, `utils`). Strict IPC limits in `capabilities/default.json`.
- **Terminal:** Default to `vim` for all CLI file editing examples.
- **Code Delivery:** Always provide the complete and updated file without placeholders or partial snippets, unless the target file strictly exceeds 1000 lines.