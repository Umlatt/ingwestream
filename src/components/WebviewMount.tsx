import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { getVersion, getName } from "@tauri-apps/api/app";
import { cn } from "@/lib/utils";
import { useServicesStore, useActiveServices } from "@/store/services";
import type { ServiceDefinition } from "@/services/serviceRegistry";

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

function ServiceLoadingOverlay({ activeId }: { activeId: string }) {
  const services = useActiveServices();
  const service = services.find((s) => s.id === activeId);

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-bg-base">
      {service && (
        <>
          {/* Fixed-size container so the spinner ring positions consistently
              regardless of the favicon's natural pixel size inside it. */}
          <div className="relative flex items-center justify-center size-12">
            <ServiceFavicon src={service.faviconUrl} alt={service.label} size="lg" />
            <div className="absolute -inset-3 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          </div>
          <p className="text-sm text-text-secondary">{service.label}</p>
        </>
      )}
      <p className="text-xs text-text-disabled tracking-widest uppercase">
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
    <div className="absolute inset-0 flex flex-col">
      <LauncherPane title="Video" services={video} />
      <div className="shrink-0 border-t border-border-base" />
      <LauncherPane title="Music" services={music} />
      <LauncherFooter />
    </div>
  );
}

function LauncherFooter() {
  const [appName, setAppName] = useState("IngweStream");
  const [version, setVersion] = useState("");
  useEffect(() => {
    getName().then(setAppName).catch(() => {});
    getVersion().then(setVersion).catch(() => {});
  }, []);
  return (
    <footer className="shrink-0 border-t border-border-base px-6 py-2.5 text-center text-[11px] text-text-disabled tracking-wide">
      <span className="text-text-muted">{appName}</span>
      {version && <> &middot; v{version}</>}
      <span className="mx-2 text-text-disabled">—</span>
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
      <p className="shrink-0 text-xs tracking-widest uppercase text-text-muted text-center py-4">
        {title}
      </p>
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
