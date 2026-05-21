import { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServicesStore, useActiveServices } from "@/store/services";
import type { ServiceDefinition } from "@/services/serviceRegistry";

export function WebviewMount() {
  const activeId = useServicesStore((s) => s.activeId);

  return (
    <div className="relative flex-1 overflow-hidden bg-bg-base">
      {activeId ? (
        <div id={`webview-mount-${activeId}`} className="absolute inset-0" />
      ) : (
        <ServiceLauncher />
      )}
    </div>
  );
}

function ServiceFavicon({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Globe className="size-5 shrink-0 text-text-muted" />;
  return (
    <img
      src={src}
      alt={alt}
      className="size-5 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
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
        "flex flex-col items-center justify-center gap-2 p-3 rounded-lg",
        "bg-bg-surface border border-border-base",
        "hover:bg-bg-elevated hover:border-border-strong transition-colors duration-150",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "aspect-square w-full",
      )}
    >
      <ServiceFavicon src={service.faviconUrl} alt={service.label} />
      <span className="text-xs text-text-secondary text-center leading-tight line-clamp-2">
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
    <div className="absolute inset-0 overflow-y-auto p-6">
      <LauncherSection title="Video" services={video} />
      <LauncherSection title="Music" services={music} />
      {uncategorised.length > 0 && (
        <LauncherSection title="Other" services={uncategorised} />
      )}
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
    <section className="mb-6">
      <p className="text-xs tracking-widest uppercase text-text-muted mb-3">
        {title}
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-3">
        {services.map((s) => (
          <ServiceCard key={s.id} service={s} />
        ))}
      </div>
    </section>
  );
}
