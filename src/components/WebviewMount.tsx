import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { getVersion, getName } from "@tauri-apps/api/app";
import { cn } from "@/lib/utils";
import { useServicesStore, useActiveServices } from "@/store/services";
import type { ServiceDefinition } from "@/services/serviceRegistry";
import logoUrl from "../../media/logo.png";

export function WebviewMount() {
  const activeId = useServicesStore((s) => s.activeId);
  const flyoutOpen = useServicesStore((s) => s.flyoutOpen);
  const isLoading = useServicesStore((s) => s.isLoading);

  return (
    <div className="absolute inset-0 bg-bg-base">
      {!activeId ? (
        <ServiceLauncher />
      ) : flyoutOpen ? (
        // Native webview is hidden while flyout is open — show a placeholder so
        // the content area isn't just a black void behind the sidebar backdrop.
        <ServicePause activeId={activeId} />
      ) : (
        <>
          <div id={`webview-mount-${activeId}`} className="absolute inset-0" />
          {isLoading && <ServiceLoadingOverlay activeId={activeId} />}
        </>
      )}
    </div>
  );
}

function ServiceFavicon({
  src,
  alt,
  size = "sm",
}: {
  src: string;
  alt: string;
  size?: "sm" | "lg" | "xl";
}) {
  const [failed, setFailed] = useState(false);
  // Inline (sm) renders at a fixed size; lg/xl auto-size to the favicon's
  // natural pixel dimensions, capped so the layout stays stable. `w-auto h-auto`
  // prevents stretching tiny (16×16) favicons into a blurry larger size.
  const isInline = size === "sm";
  const imgCls = isInline
    ? "size-5 shrink-0 rounded-sm"
    : "w-auto h-auto max-w-10 max-h-10 rounded-md";
  // Globe fallback is an SVG with no natural size — give it an explicit size
  // matching the variant so layout doesn't collapse when a favicon fails to load.
  const fallbackCls = isInline ? "size-5 text-text-muted" : "size-8 text-text-muted";
  if (failed) return <Globe className={fallbackCls} />;
  return (
    <img
      src={src}
      alt={alt}
      className={imgCls}
      onError={() => setFailed(true)}
    />
  );
}

function ServicePause({ activeId }: { activeId: string }) {
  const services = useActiveServices();
  const service = services.find((s) => s.id === activeId);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-base">
      {service && (
        <>
          <ServiceFavicon src={service.faviconUrl} alt={service.label} />
          <p className="text-sm text-text-secondary">{service.label}</p>
        </>
      )}
      <p className="text-xs text-text-disabled tracking-widest uppercase">
        Paused
      </p>
    </div>
  );
}

// Mirrors ServicePause's layout so picking a new service from the flyout doesn't
// jump from the small "Paused" card to a different big-spinner UI — the visual
// stays in the same shape, just with the new service's favicon/label and a
// pulsing "Loading" caption. The title bar's animated bar provides the primary
// loading animation; the pulse covers the fullscreen case where the bar is hidden.
function ServiceLoadingOverlay({ activeId }: { activeId: string }) {
  const services = useActiveServices();
  const service = services.find((s) => s.id === activeId);

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-bg-base">
      {service && (
        <>
          <ServiceFavicon src={service.faviconUrl} alt={service.label} />
          <p className="text-sm text-text-secondary">{service.label}</p>
        </>
      )}
      <p className="text-xs text-text-disabled tracking-widest uppercase animate-pulse">
        Loading
      </p>
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceDefinition }) {
  const openService = useServicesStore((s) => s.openService);
  const isLoading = useServicesStore((s) => s.isLoading);

  return (
    <button
      onClick={() => openService(service)}
      disabled={isLoading}
      title={service.label}
      aria-label={service.label}
      className={cn(
        // Fixed square size so every cell in every pane is identical regardless
        // of the favicon's natural size.
        "shrink-0 size-24 flex items-center justify-center",
        "transition-transform duration-150",
        "hover:scale-110 active:scale-95",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md",
      )}
    >
      <ServiceFavicon src={service.faviconUrl} alt={service.label} size="xl" />
    </button>
  );
}

function ServiceLauncher() {
  const services = useActiveServices();

  // Music goes in the music pane; everything else (video, uncategorised custom, …)
  // goes in the video pane so the two panes split the available height evenly.
  const music = services.filter((s) => s.category === "music");
  const video = services.filter((s) => s.category !== "music");

  return (
    <div className="absolute inset-0 flex flex-col bg-bg-base">
      <LauncherHeader />
      <LauncherPane title="Video" services={video} />
      <div className="shrink-0 border-t border-border-base" />
      <LauncherPane title="Music" services={music} />
      <LauncherFooter />
    </div>
  );
}

function LauncherHeader() {
  const [appName, setAppName] = useState("IngweStream");
  useEffect(() => {
    getName().then(setAppName).catch(() => {});
  }, []);
  return (
    <header className="shrink-0 flex items-center justify-center gap-5 px-8 pt-8 pb-6">
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        className="size-14 object-contain drop-shadow-[0_2px_12px_rgba(79,134,247,0.25)]"
      />
      <div className="flex flex-col leading-tight">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {appName}
        </h1>
        <p className="text-xs text-text-muted mt-1 tracking-wide">
          Choose a service to begin
        </p>
      </div>
    </header>
  );
}

function LauncherFooter() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);
  return (
    <footer className="shrink-0 border-t border-border-base px-6 py-2.5 text-center text-[11px] text-text-disabled tracking-wide">
      {version && <span className="text-text-muted">v{version}</span>}
      {version && <span className="mx-2 text-text-disabled">—</span>}
      brought to you by{" "}
      <span className="text-text-secondary font-medium">Lazy Lion Consulting</span>
    </footer>
  );
}

function LauncherPane({
  title,
  services,
}: {
  title: string;
  services: ServiceDefinition[];
}) {
  return (
    <section className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 flex items-center gap-3 px-8 py-3">
        <div className="h-px flex-1 bg-border-base" />
        <p className="text-[10px] tracking-[0.2em] uppercase font-semibold text-text-muted">
          {title}
        </p>
        <div className="h-px flex-1 bg-border-base" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-6">
        {/* flex-wrap + justify-center keeps every row — including a partial
            last row — horizontally centred within the pane. */}
        <div className="flex flex-wrap justify-center gap-3">
          {services.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </div>
      </div>
    </section>
  );
}
