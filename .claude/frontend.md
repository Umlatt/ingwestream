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
- Right: cinema mode toggle (Expand/Shrink) → `toggleFullscreen()` | Minimise |
  **Soft-maximise (Square / mirrored Copy)** | Close
- Close button uses `hover:bg-danger`
- Loading bar: `absolute bottom-0 left-0 right-0 h-[2px]` with `animate-loading-bar`,
  driven by `useServicesStore.isLoading`

**Soft maximise** (avoiding the Windows frameless-WS_MAXIMIZE taskbar glitch — see
`.claude/windows-webview2.md`):

```tsx
const savedBoundsRef = useRef<SavedBounds | null>(null);
const [isMaximized, setIsMaximized] = useState(false);

const toggleMaximize = async () => {
  if (isMaximized && savedBoundsRef.current) {
    const { position, size } = savedBoundsRef.current;
    await win.setPosition(position);
    await win.setSize(size);
    savedBoundsRef.current = null;
    setIsMaximized(false);
    return;
  }
  const [position, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
  savedBoundsRef.current = { position, size };
  const wa = await invoke<WorkArea>("get_work_area");
  await win.setPosition(new PhysicalPosition(wa.x, wa.y));
  await win.setSize(new PhysicalSize(wa.width, wa.height));
  setIsMaximized(true);
};
```

The OS never enters WS_MAXIMIZE; maximise state is tracked locally in the component.
`tauri.conf.json` has `"maximizable": false` so Win+Up and drag-snap can't bypass this.

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
- **Right-click** any `ServiceItem` → `resetService(service)` which invokes the
  `reset_service` Rust command. Always navigates the webview to the service's default URL
  even when it's already active. The `title` attribute hints at this affordance.

### `WebviewMount.tsx`

Shows different content depending on state:

| Condition                                  | Renders                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `!activeId`                                | `ServiceLauncher` — logo hero + two equal-height service panes + version footer      |
| `activeId && flyoutOpen`                   | `ServicePause` — favicon + name + "Paused" label                                     |
| `activeId && !flyoutOpen`                  | `div#webview-mount-{id}` (invisible anchor; native webview renders above)            |
| `activeId && !flyoutOpen && isLoading`     | ↑ + `ServiceLoadingOverlay` z-20 — favicon + name + pulsing "Loading" caption        |

Root div is `absolute inset-0 bg-bg-base` — fills the `relative flex-1` parent in App.tsx.

#### `ServiceLauncher`

Top-down flex column: `LauncherHeader` → `LauncherPane "Video"` → `LauncherPane "Music"`
→ `LauncherFooter`. **No divider between panes** — the section title's hairlines do all
the visual separation.

- `LauncherHeader` — `size-14` logo from `./media/logo.png` (imported via Vite relative
  path; picked up by `vite/client`'s `*.png` types) with an accent-tinted drop shadow,
  app name from `getName()`, and a "Choose a service to begin" tagline.
- `LauncherPane` — `flex-1 min-h-0 flex flex-col`, with a hairline-framed section title
  on top and a scroll container below. The scroll container's child uses `min-h-full
  flex items-center justify-center` so the icons centre **vertically and horizontally**
  when they fit, and the outer `overflow-y-auto` takes over when they don't.
- `ServiceCard` — fixed `size-24` button containing just the favicon. No background, no
  border, no label — `aria-label` and `title` provide the service name. Hover scales the
  card to `1.1`, press shrinks to `0.95`.
- Favicons render via `w-auto h-auto max-w-10 max-h-10` so a small native favicon
  (16/32 px) is never upscaled into a blurry larger size; larger favicons cap at 40 px.
- `LauncherFooter` — version pulled from `getVersion()`, plus the
  *brought to you by Lazy Lion Consulting* credit.

#### `ServiceLoadingOverlay`

Mirrors `ServicePause`'s layout (small inline favicon, label, lowercase caption) so
switching services from the flyout transitions smoothly between paused → loading
visuals instead of jumping to a different overlay style. The caption pulses
(`animate-pulse`) and the title bar's loading bar provides the primary indicator.

### `ServiceWizard.tsx`

Full-screen modal overlay (`fixed inset-0 z-50 bg-bg-base`). Opens on first run or
when the user clicks Settings in the sidebar.

- `WizardHeader` mirrors `LauncherHeader` exactly — same `size-14` logo with accent
  drop-shadow, same app-name typography, "Choose which services to keep, or add your
  own" tagline. Close X is absolutely positioned in the top-right so the hero stays
  centred.
- Refuses to close (no X rendered) until at least one service is selected.
- `SectionDivider` — hairline-framed section title matching `LauncherPane`'s style.
  Used for Video streaming / Music streaming / Custom services.
- `ServiceCard` (built-in) — selectable card with check badge in the corner when
  selected. Grid: `grid-cols-[repeat(auto-fill,minmax(88px,1fr))]`.
- `CustomServiceCard` — same selectable card + hover toolbar with Edit / Delete.
- `CategoryPicker` — two-segment Video / Music toggle in both the add form and the
  inline edit panel. Writes to `ServiceDefinition.category` so new services land in
  the correct launcher pane.
- Add custom service form: URL input → derive domain → favicon preview → add. Pressing
  Enter in any input also submits.
- Footer: right-aligned compact "Continue with N service(s)" button (not full-width).
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

### Render variants

`WebviewMount.tsx` exposes a `ServiceFavicon` with three size variants:

| Variant | Sizing                            | Used for                                      |
| ------- | --------------------------------- | --------------------------------------------- |
| `sm`    | `size-5` fixed (20 px)            | Inline / pause / loading overlay              |
| `lg`    | `w-auto h-auto max-w-10 max-h-10` | Loading overlay (wrapped in a `size-12` ring) |
| `xl`    | `w-auto h-auto max-w-10 max-h-10` | Launcher cards                                |

The `lg` / `xl` variants intentionally use `w-auto h-auto` so a 16/32 px favicon
renders at its **native pixel size**, never upscaled into a blurry larger version. The
`max-w-10 max-h-10` cap downscales larger favicons to a consistent maximum.

The `Globe` fallback uses an explicit `size-5` or `size-8` because SVGs have no
natural pixel size and would collapse with `w-auto h-auto`:

```tsx
function ServiceFavicon({ src, alt, size }) {
  const [failed, setFailed] = useState(false);
  const isInline = size === "sm";
  const imgCls = isInline
    ? "size-5 shrink-0 rounded-sm"
    : "w-auto h-auto max-w-10 max-h-10 rounded-md";
  const fallbackCls = isInline ? "size-5 text-text-muted" : "size-8 text-text-muted";
  if (failed) return <Globe className={fallbackCls} />;
  return <img src={src} alt={alt} className={imgCls}
              onError={() => setFailed(true)} />;
}
```

---

## Zustand store (`src/store/services.ts`)

```ts
interface ServicesState {
  activeId:        string | null;
  flyoutOpen:      boolean;
  isLoading:       boolean;       // true between openService dispatch and
                                  // service-load-finished event
  isFullscreen:    boolean;       // mirrors Rust state via fullscreen-changed event
  wizardOpen:      boolean;
  enabledIds:      string[];      // persisted; defaults to all SERVICES ids
  customServices:  ServiceDefinition[];  // each carries category: "video" | "music"

  openService(service):   Promise<void>;
  resetService(service):  Promise<void>;  // right-click → force-navigate to default URL
  closeService():         Promise<void>;
  setLoading(value):      void;   // App.tsx event listener clears isLoading via this
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

// Derived list — alphabetically merges built-in and custom services by label.
// Always prefer this over reading enabledIds / customServices directly.
export function useActiveServices(): ServiceDefinition[]
```

**`isLoading` lifecycle** — `openService` sets `isLoading: true` synchronously (skipped
for same-service reopen). It is **cleared** by the `service-load-finished` Tauri event
listener in `App.tsx` calling `setLoading(false)`, *not* in the `openService` finally
block, so the loading overlay stays visible until the webview's `on_page_load(Finished)`
fires:

```ts
openService: async (service) => {
  if (get().isLoading) return;
  const sameService = get().activeId === service.id;
  set({ activeId: service.id, flyoutOpen: false, isLoading: !sameService });
  try {
    await invoke("open_service", { serviceId: service.id, url: service.url });
    invoke("update_window_icon", { faviconUrl: service.faviconUrl }).catch(() => {});
  } catch (e) {
    console.error("[ingwe] open_service failed:", e);
    set({ isLoading: false });   // failure path only — success is cleared by event
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
