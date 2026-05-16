# Ingwe: Copilot Workspace Instructions

## 1. Architecture & Stack
- **Core:** Rust (Tauri v2), TypeScript, React, Tailwind CSS v4, shadcn/ui.
- **WebViews:** Native OS webviews (WebView2, WKWebView, WebKitGTK).
- **State:** Isolated wrappers with strict cross-session persistence (cookies, localStorage).

## 2. Identity & UI Standards
- **App Name:** Ingwe
- **Theme:** Strict Dark Mode (OLED blacks, deep grays). No light mode. Tailwind `class` strategy.
- **Service WebViews:** Force `prefers-color-scheme: dark`. Inject custom CSS/JS on init if native support fails.

## 3. Core Features & Integration
- **Throttling:** Aggressively pause/hide out-of-focus background webviews to minimize RAM/CPU.
- **Tray:** `tauri-plugin-tray` with standard media playback controls.
- **Global Media:** Route OS media key events (SMTC, MPRIS) directly to the active webview.
- **Playback:** Widevine DRM enabled via platform flags. Support HTML5, HLS, DASH, WebRTC.

## 4. Output & Token Discipline
- **Zero Fluff:** Omit pleasantries, conversational filler, and redundant step-by-step reasoning.
- **Code Delivery:** Output complete, fully updated files without placeholders. Only use snippets if the target file > 1000 lines.
- **CLI Rules:** Default to `vim` for all terminal text editing examples.
- **Context Filters:** Do not ingest `target/`, `dist/`, generated assets, or build logs.

## 5. Knowledge Routing (On-Demand)
*If deep domain context is required, prompt the user to explicitly attach the relevant file:*
- UI/UX Guidelines -> `#file: .github/prompts/ui.prompt.md`
- Backend/Rust IPC -> `#file: .github/prompts/backend.prompt.md`