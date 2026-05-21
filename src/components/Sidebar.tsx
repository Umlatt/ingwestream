import { useRef, useState } from "react";
import { Settings, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServicesStore, useActiveServices } from "@/store/services";
import type { ServiceDefinition } from "@/services/serviceRegistry";

function ServiceFavicon({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Globe className="size-4 shrink-0 text-text-muted" />;
  return (
    <img
      src={src}
      alt={alt}
      className="size-4 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}

function ServiceItem({
  service,
  isActive,
  isLoading,
}: {
  service: ServiceDefinition;
  isActive: boolean;
  isLoading: boolean;
}) {
  const openService = useServicesStore((s) => s.openService);
  const resetService = useServicesStore((s) => s.resetService);

  return (
    <button
      onClick={() => openService(service)}
      onContextMenu={(e) => {
        // Right-click → reset service to its default URL. Useful when a user is
        // lost deep in a service (e.g. on a login wall) and wants to start over.
        e.preventDefault();
        resetService(service);
      }}
      disabled={isLoading}
      title={`${service.label} — right-click to reset`}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-150",
        "text-text-secondary hover:text-text-primary hover:bg-bg-elevated",
        isActive && "bg-bg-overlay text-text-primary",
        isLoading && "cursor-not-allowed opacity-60",
      )}
    >
      <ServiceFavicon src={service.faviconUrl} alt={service.label} />
      <span className="truncate">{service.label}</span>
    </button>
  );
}

export function Sidebar() {
  const flyoutOpen = useServicesStore((s) => s.flyoutOpen);
  const closeFlyout = useServicesStore((s) => s.closeFlyout);
  const openWizard = useServicesStore((s) => s.openWizard);
  const activeId = useServicesStore((s) => s.activeId);
  const isLoading = useServicesStore((s) => s.isLoading);
  const isFullscreen = useServicesStore((s) => s.isFullscreen);
  const services = useActiveServices();
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  return (
    <>
      {/* Click-capture overlay — closes flyout when clicking outside the panel.
          No fill colour: bg-base is already dark, any overlay just blacks it out. */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-20 transition-opacity duration-200",
          isFullscreen ? "top-0" : "top-8",
          flyoutOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        )}
        onClick={closeFlyout}
      />

      {/* Flyout panel — starts below titlebar in normal mode, full-height in fullscreen */}
      <aside
        className={cn(
          "fixed left-0 bottom-0 w-52 flex flex-col",
          "bg-bg-surface border-r border-border-base z-30",
          "transition-transform duration-200 ease-in-out",
          isFullscreen ? "top-0" : "top-8",
          flyoutOpen ? "translate-x-0" : "-translate-x-full",
        )}
        onMouseEnter={() => clearTimeout(leaveTimerRef.current)}
        onMouseLeave={() => {
          if (isFullscreen) {
            leaveTimerRef.current = setTimeout(() => closeFlyout(), 600);
          }
        }}
      >
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {services.map((svc) => (
            <ServiceItem
              key={svc.id}
              service={svc}
              isActive={activeId === svc.id}
              isLoading={isLoading}
            />
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-border-base">
          <button
            onClick={() => openWizard()}
            className="w-full flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors duration-150 py-1 px-1 rounded"
          >
            <Settings className="size-3.5 shrink-0" />
            <span>Settings</span>
          </button>
        </div>
      </aside>
    </>
  );
}
