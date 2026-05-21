import { useState } from "react";
import { Globe } from "lucide-react";
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
  size?: "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const cls = size === "lg" ? "size-12 shrink-0" : "size-5 shrink-0";
  if (failed)
    return <Globe className={cn(cls, "text-text-muted")} />;
  return (
    <img
      src={src}
      alt={alt}
      className={cn(cls, size === "lg" ? "rounded-md" : "rounded-sm")}
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
          <div className="relative">
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
      className={cn(
        "flex flex-col items-center justify-center gap-4 p-5 rounded-lg",
        "bg-bg-surface border border-border-base",
        "hover:bg-bg-elevated hover:border-border-strong transition-colors duration-150",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "aspect-square w-full",
      )}
    >
      <ServiceFavicon src={service.faviconUrl} alt={service.label} size="lg" />
      <span className="text-sm text-text-secondary text-center leading-tight line-clamp-2">
        {service.label}
      </span>
    </button>
  );
}

function ServiceLauncher() {
  const services = useActiveServices();

  const video = services.filter((s) => s.category === "video" || s.isCustom);
  const music = services.filter((s) => s.category === "music");
  const uncategorised = services.filter(
    (s) => !s.category && !s.isCustom,
  );

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-10">
        <LauncherSection title="Video" services={video} />
        <LauncherSection title="Music" services={music} />
        {uncategorised.length > 0 && (
          <LauncherSection title="Other" services={uncategorised} />
        )}
      </div>
    </div>
  );
}

function LauncherSection({
  title,
  services,
}: {
  title: string;
  services: ServiceDefinition[];
}) {
  if (services.length === 0) return null;
  return (
    <section className="mb-10 last:mb-0">
      <p className="text-xs tracking-widest uppercase text-text-muted mb-5 text-center">
        {title}
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
        {services.map((s) => (
          <ServiceCard key={s.id} service={s} />
        ))}
      </div>
    </section>
  );
}
