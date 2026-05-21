# IngweStream — Frontend Deep Context

## Tech

- React 19, TypeScript ~5.8, Vite 7
- Tailwind CSS v4 (Vite plugin — no `tailwind.config.js`, config is in `index.css` `@theme`)
- shadcn/ui (`components.json` — `style: default`, `baseColor: slate`, `cssVariables: true`)
- Zustand 5 (no immer, no persist middleware — persistence via `tauri-plugin-store`)
- lucide-react 1.x for all icons
- `clsx` + `tailwind-merge` via `cn()` in `@/lib/utils`

Path alias: `@/` → `src/`

---

## Tailwind v4 — critical differences from v3

- No `tailwind.config.js`. All customisation lives in `index.css` inside `@theme {}`.
- Import is `@import "tailwindcss"` not `@tailwind base/components/utilities`.
- Custom tokens become utilities automatically: `bg-bg-base`, `text-text-primary`, etc.
- Arbitrary values still work: `w-[52px]`, `bg-[#111]`.
- `@layer base {}` for CSS resets and shadcn/ui variable mappings.
- Vite plugin handles JIT — no separate PostCSS step.

---

## Complete design token reference

All defined in `src/index.css` `@theme {}`:

### Backgrounds

```css
--color-bg-base:     #000000  /* page background, OLED black */
--color-bg-surface:  #0a0a0a  /* cards, panels, titlebar, sidebar */
--color-bg-elevated: #111111  /* hover state, dropdowns */
--color-bg-overlay:  #1a1a1a  /* active selected item */
--color-bg-subtle:   #222222  /* subtle separators, muted areas */
```

Tailwind classes: `bg-bg-base`, `bg-bg-surface`, `bg-bg-elevated`, `bg-bg-overlay`, `bg-bg-subtle`

### Borders

```css
--color-border-base:   #2a2a2a
--color-border-strong: #3a3a3a
```

Tailwind: `border-border-base`, `border-border-strong`

### Text

```css
--color-text-primary:  #f0f0f0
--color-text-secondary:#a0a0a0
--color-text-muted:    #606060
--color-text-disabled: #404040
```

Tailwind: `text-text-primary`, `text-text-secondary`, `text-text-muted`, `text-text-disabled`

### Accent (blue)

```css
--color-accent:       #4f86f7
--color-accent-hover: #6a9bf9
--color-accent-dim:   #1a2f5a
```

Tailwind: `text-accent`, `bg-accent`, `text-accent-hover`, `bg-accent-dim`

### Danger (red)

```css
--color-danger:     #e05252
--color-danger-dim: #3b1818
```

Tailwind: `text-danger`, `bg-danger`, `bg-danger-dim`

### Shape / Shadow

```css
--radius-sm: 4px   /* rounded-sm */
--radius-md: 8px   /* rounded-md */
--radius-lg: 12px  /* rounded-lg */
--shadow-float: 0 4px 24px rgba(0,0,0,0.8)
```

### Animation

```css
--animate-loading-bar: ingwe-loading-bar 1.3s ease-in-out infinite;
```

Tailwind: `animate-loading-bar`
Keyframes: `0% translateX(-100%)` → `100% translateX(210%)` (sliding indeterminate bar)

---

## shadcn/ui CSS variable bridge

`index.css` `@layer base` maps Tailwind tokens → shadcn HSL variables so shadcn
components inherit the dark theme without a separate `globals.css`.

Add shadcn components: `npx shadcn@latest add <name>`
They land in `src/components/ui/` and use `cn()` internally.

---

## Component inventory

### `App.tsx`

Root layout shell. Mounts the store, registers Tauri event listeners.

```tsx
<div className="flex flex-col h-screen bg-bg-base text-text-primary overflow-hidden">
  <ResizeBorder />                  {/* fixed, z-99999, 8 resize handles */}
  <TitleBar />                      {/* h-8 normal, h-0 fullscreen */}
  <div className="relative flex-1 overflow-hidden">
    <WebviewMount />                {/* absolute inset-0 */}
    <Sidebar />                     {/* fixed, z-30 */}
  </div>
  {wizardOpen && <ServiceWizard />} {/* fixed inset-0, z-50 */}
  {/* Floating overlay titlebar — fullscreen only */}
  {isFullscreen && overlayVisible && (
    <div className="fixed top-0 inset-x-0 z-[100]">
      <TitleBar forceShow />
    </div>
  )}
</div>
```

App.tsx registers:

- `listen("fullscreen-changed")` → `setFullscreen`, calls `apply_fullscreen_resize`
- `listen("edge-enter")` → `show_titlebar_overlay(true)`
- `listen("edge-leave")` → auto-hide titlebar after 1.5 s
- `listen("edge-left-enter")` → `openFlyout()` (fullscreen only)
- `listen("edge-left-leave")` → `closeFlyout()` after 800 ms (fullscreen only)
- `listen("overlay-changed")` → `setOverlayVisible`

### `TitleBar.tsx`

Props: `forceShow?: boolean` (used for the overlay copy in fullscreen).

- `data-tauri-drag-region` on outer div and title `<span>`
- Collapses to `h-0 overflow-hidden opacity-0` when fullscreen and not `forceShow`
- Left: `<LayoutGrid>` button (toggleFlyout) + active service label or "IngweStream"
- Right: cinema mode toggle (Expand/Shrink) → `toggleFullscreen()` | Minimize | Close
- Close button uses `hover:bg-danger`
- Loading bar: `absolute bottom-0 left-0 right-0 h-[2px]` with `animate-loading-bar`
- No Maximize button — window is `maximizable: false`

### `Sidebar.tsx`

The flyout panel. Uses `fixed` positioning so it overlays the native child webview when
the webview is hidden.

- **Backdrop**: `fixed inset-x-0 bottom-0 z-20`, `top-8` in normal mode / `top-0` in
  fullscreen. Transparent (no fill) — exists only to capture outside-clicks for close.
- **Panel**: `fixed left-0 bottom-0 w-52 z-30`, `top-8` normal / `top-0` fullscreen.
  Slides via `translate-x-0` / `-translate-x-full`, `transition-transform duration-200`.
- Auto-closes after 600 ms `onMouseLeave` when in fullscreen mode.
- Settings button at the bottom calls `openWizard()` (which also handles hiding the service view).
- `ServiceItem` button: `w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm`
- Active item: `bg-bg-overlay text-text-primary`

### `WebviewMount.tsx`

Shows different content depending on state:

| Condition                 | Renders                                                                           |
| ------------------------- | --------------------------------------------------------------------------------- |
| `!activeId`               | `ServiceLauncher` — grid of all enabled services                                  |
| `activeId && flyoutOpen`  | `ServicePause` — favicon + name + "Paused" label                                  |
| `activeId && !flyoutOpen` | `div#webview-mount-{id}` — invisible anchor; native webview renders above         |

Root div is `absolute inset-0 bg-bg-base` — fills the `relative flex-1` parent in App.tsx.

`ServiceLauncher` groups services into Video / Music / Other sections using
`grid-cols-[repeat(auto-fill,minmax(80px,1fr))]` with square `aspect-square` cards.

### `ServiceWizard.tsx`

Full-screen modal overlay (`fixed inset-0 z-50 bg-bg-base`). Opens on first run or
when the user clicks Settings in the sidebar.

- Checkboxes for all predefined services (grouped Video / Music)
- Custom service list with delete buttons
- Add custom service form: URL input → derive domain → show favicon preview → add
- Save calls `saveServiceConfig(selectedIds, customList)` which persists to `ingwe.json`

### `ResizeBorder.tsx`

Eight `position: fixed; z-index: 99999` hit areas at window edges and corners.
Each `onMouseDown` calls `getCurrentWindow().startResizeDragging(dir)`.

Constants: `S = 4` (edge strip width px), `C = 12` (corner square size px).

Resize directions: `North | South | East | West | NorthEast | NorthWest | SouthEast | SouthWest`

---

## Service favicon pattern

Services no longer use a lucide icon map. Each `ServiceDefinition` has a `faviconUrl`:

```ts
export interface ServiceDefinition {
  id:         string;
  label:      string;
  url:        string;
  faviconUrl: string;                  // from DuckDuckGo favicon API
  category?:  "video" | "music";
  isCustom?:  boolean;
}
```

Favicon helper (module-private in `serviceRegistry.ts`):

```ts
const fav = (domain: string) =>
  `https://icons.duckduckgo.com/ip3/${domain}.ico`;
```

Render pattern with Globe fallback:

```tsx
function ServiceFavicon({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Globe className="size-4 shrink-0 text-text-muted" />;
  return <img src={src} alt={alt} className="size-4 shrink-0 rounded-sm"
              onError={() => setFailed(true)} />;
}
```

---

## Zustand store (`src/store/services.ts`)

```ts
interface ServicesState {
  activeId:        string | null;
  flyoutOpen:      boolean;
  isLoading:       boolean;       // true while open_service is in-flight
  isFullscreen:    boolean;       // mirrors Rust state via fullscreen-changed event
  wizardOpen:      boolean;
  enabledIds:      string[];      // persisted; defaults to all SERVICES ids
  customServices:  ServiceDefinition[];

  openService(service):   Promise<void>;
  closeService():         Promise<void>;
  openFlyout():           void;   // idempotent; hides service view if active
  toggleFlyout():         void;
  closeFlyout():          void;   // shows service view if active
  toggleFullscreen():     Promise<void>;
  setFullscreen(v):       void;   // called from fullscreen-changed event listener
  openWizard():           void;   // closes flyout + hides service view
  closeWizard():          void;   // shows service view if active
  saveServiceConfig(ids, custom): Promise<void>;  // persists + closes wizard + shows service view
  initFromStore():        Promise<void>;           // called once in App mount useEffect
}

// Derived list — always prefer this over reading enabledIds directly
export function useActiveServices(): ServiceDefinition[]
```

**`isLoading` guard** — always preserve this in `openService`:

```ts
openService: async (service) => {
  if (get().isLoading) return;   // prevents double-navigation and UI flicker
  set({ activeId: service.id, flyoutOpen: false, isLoading: true });
  try {
    await invoke("open_service", { serviceId: service.id, url: service.url });
    invoke("update_window_icon", { faviconUrl: service.faviconUrl }).catch(() => {});
  } catch (e) {
    console.error("[ingwe] open_service failed:", e);
  } finally {
    set({ isLoading: false });
  }
},
```

**Initial state**: `enabledIds` is initialised to `SERVICES.map(s => s.id)` so the service
launcher is populated immediately on render, before `initFromStore` completes.

**Wizard / service view lifecycle**:

```text
openWizard()  → flyoutOpen=false, wizardOpen=true,  hide_service_view (if active)
closeWizard() →                   wizardOpen=false, show_service_view (if active)
saveServiceConfig() →              wizardOpen=false, show_service_view (if active)
openFlyout()  → flyoutOpen=true,                   hide_service_view (if active)
closeFlyout() → flyoutOpen=false,                  show_service_view (if active)
```

The service view must be hidden whenever the wizard or flyout is open because native child
webviews render above React content regardless of CSS z-index.

---

## New component checklist

1. File: `src/components/MyComponent.tsx`
2. Imports: `cn` from `@/lib/utils`, icons from `lucide-react`, store selectors as needed
3. Styling: use design tokens only — no hardcoded hex/rgb values
4. No `document` / `window` access without guard
5. For icon-only buttons: always include `aria-label`
6. Prefer `transition-colors duration-150` for hover; `duration-200` for panel slides

---

## TypeScript conventions

- Strict mode on (`tsconfig.json` extends strict)
- Prefer `interface` for object shapes, `type` for unions
- `@/` alias everywhere — no relative `../` imports crossing component boundaries
- Named exports for components; default export only for `App.tsx`

---

## Performance notes

- `useActiveServices()` recomputes on every `enabledIds` or `customServices` change — fine
  for ~40 services; no `useMemo` needed
- Use granular `useServicesStore((s) => s.someField)` selectors — avoid `s => s`
- The native child webview runs outside React — no VDOM overhead for streaming content
- `React.StrictMode` is ON in dev (effects fire twice) but OFF in production builds
