---
applyTo: "src/**/*.{tsx,ts,css}"
---

# UI Domain: Tailwind v4 · shadcn/ui · Dark Theme · Webview Injection

## Tailwind v4 Configuration

**Entry point:** `src/index.css` — no `tailwind.config.js`. All tokens live in `@theme {}`.

```css
@import "tailwindcss";

@theme {
  /* OLED blacks + deep gray scale */
  --color-bg-base:    #000000;
  --color-bg-surface: #0a0a0a;
  --color-bg-elevated:#111111;
  --color-bg-overlay: #1a1a1a;
  --color-bg-subtle:  #222222;

  /* Borders */
  --color-border-base:   #2a2a2a;
  --color-border-strong: #3a3a3a;

  /* Text */
  --color-text-primary:   #f0f0f0;
  --color-text-secondary: #a0a0a0;
  --color-text-muted:     #606060;
  --color-text-disabled:  #404040;

  /* Accent — single hue, desaturated */
  --color-accent:       #4f86f7;
  --color-accent-hover: #6a9bf9;
  --color-accent-dim:   #1a2f5a;

  /* Danger */
  --color-danger:      #e05252;
  --color-danger-dim:  #3b1818;

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Shadows (use sparingly on OLED) */
  --shadow-float: 0 4px 24px rgba(0,0,0,0.8);
}
```

**Dark mode strategy:** Tailwind `class` (not `media`). Root element always carries `class="dark"`. Never add light-mode variants.

```ts
// vite.config.ts — ensure Tailwind plugin sees class strategy
import tailwindcss from '@tailwindcss/vite'
// plugins: [tailwindcss(), react()]
```

---

## shadcn/ui Integration

**CLI init target:** `src/components/ui/`

**`components.json` required fields:**
```json
{
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

**CSS variable mapping (shadcn → custom tokens):**
```css
@layer base {
  :root {
    --background:       0 0% 0%;
    --foreground:       0 0% 94%;
    --card:             0 0% 4%;
    --card-foreground:  0 0% 94%;
    --popover:          0 0% 7%;
    --popover-foreground: 0 0% 94%;
    --primary:          220 90% 64%;
    --primary-foreground: 220 20% 10%;
    --secondary:        0 0% 13%;
    --secondary-foreground: 0 0% 94%;
    --muted:            0 0% 13%;
    --muted-foreground: 0 0% 63%;
    --accent:           0 0% 13%;
    --accent-foreground: 0 0% 94%;
    --destructive:      0 62% 60%;
    --destructive-foreground: 0 0% 94%;
    --border:           0 0% 16%;
    --input:            0 0% 16%;
    --ring:             220 90% 64%;
    --radius:           0.5rem;
  }
  /* No .light overrides — dark is the only theme */
}
```

**Forbidden patterns:**
- `bg-white`, `text-black`, `bg-gray-*` (use custom token classes)
- `dark:` prefix on any element — all styles are dark by default
- Inline `style={{ color: '#fff' }}` — use Tailwind classes only

---

## Component Patterns

**Window chrome (frameless Tauri window):**
```tsx
// Draggable titlebar region
<div data-tauri-drag-region className="h-8 flex items-center px-3 bg-bg-surface select-none" />

// Traffic-light spacer (macOS only, conditional via platform)
<div className="w-[68px]" /> {/* left pad on macOS */}
```

**Sidebar tab item:**
```tsx
<button
  className={cn(
    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
    "text-text-secondary hover:text-text-primary hover:bg-bg-elevated",
    isActive && "bg-bg-overlay text-text-primary"
  )}
/>
```

**WebView container:**
```tsx
<div className="relative flex-1 overflow-hidden bg-bg-base">
  {/* Tauri WebviewWindow renders outside React tree — this is a placeholder */}
  <div id={`webview-mount-${serviceId}`} className="absolute inset-0" />
</div>
```

---

## Webview Dark-Theme Injection

Inject on `WebviewWindow` creation **before** first navigation. Use Tauri's `execute_script` / `init_script` API.

**CSS injection script (stored as const in Rust or JS):**
```js
// WEBVIEW_DARK_INIT — inject via tauri webview init_script
(function() {
  const meta = document.createElement('meta');
  meta.name = 'color-scheme';
  meta.content = 'dark';
  document.head.appendChild(meta);

  const style = document.createElement('style');
  style.textContent = `
    :root { color-scheme: dark !important; }
    html, body {
      background: #000 !important;
      color: #f0f0f0 !important;
    }
    /* Suppress flash of white on navigation */
    * { transition: background-color 0ms !important; }
  `;
  document.head.appendChild(style);

  // Override matchMedia so services detect dark mode
  const _matchMedia = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (q === '(prefers-color-scheme: dark)') {
      return Object.assign(_matchMedia(q), { matches: true });
    }
    return _matchMedia(q);
  };
})();
```

**Rust init_script binding (reference):**
```rust
WebviewWindowBuilder::new(app, label, url)
    .initialization_script(WEBVIEW_DARK_INIT)
    // ... other builder calls
```

---

## Strict Rules

1. All new components: functional, no class components.
2. `cn()` utility from `@/lib/utils` for conditional classes — never string interpolation.
3. Animations: `transition-colors duration-150` max. No layout-shift animations on webview swap.
4. Icons: `lucide-react` only. Size via `className="size-4"` (Tailwind v4 `size-*` shorthand).
5. Scrollbars: custom via CSS, hidden by default in webview containers.
6. Z-index scale: sidebar=10, overlay=20, modal=30, toast=40.
