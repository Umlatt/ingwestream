import { getCurrentWindow } from "@tauri-apps/api/window";
import { LayoutGrid, Minus, X, Expand, Shrink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServicesStore, useActiveServices } from "@/store/services";

export function TitleBar({ forceShow = false }: { forceShow?: boolean }) {
  const win = getCurrentWindow();
  const toggleFlyout = useServicesStore((s) => s.toggleFlyout);
  const toggleFullscreen = useServicesStore((s) => s.toggleFullscreen);
  const activeId = useServicesStore((s) => s.activeId);
  const isLoading = useServicesStore((s) => s.isLoading);
  const isFullscreen = useServicesStore((s) => s.isFullscreen);
  const services = useActiveServices();

  const activeLabel = activeId
    ? (services.find((s) => s.id === activeId)?.label ?? null)
    : null;

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "relative h-8 flex items-center justify-between bg-bg-surface border-b border-border-base select-none shrink-0",
        "transition-all duration-150",
        isFullscreen && !forceShow && "h-0 overflow-hidden opacity-0 pointer-events-none",
      )}
    >
      {/* Left: menu toggle + app/service name */}
      <div className="flex items-center h-full">
        <button
          onClick={toggleFlyout}
          className="h-full px-3 flex items-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors duration-150"
          aria-label="Services"
        >
          <LayoutGrid className="size-3.5" />
        </button>
        <span
          data-tauri-drag-region
          className="pl-1 text-xs font-semibold tracking-widest uppercase text-text-muted"
        >
          {activeLabel ?? "IngweStream"}
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center h-full">
        <button
          onClick={toggleFullscreen}
          className="h-full px-3 flex items-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors duration-150"
          aria-label="Cinema mode"
        >
          {isFullscreen ? (
            <Shrink className="size-3.5" />
          ) : (
            <Expand className="size-3.5" />
          )}
        </button>
        <button
          onClick={() => win.minimize()}
          className="h-full px-4 flex items-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors duration-150"
          aria-label="Minimise"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          onClick={() => win.close()}
          className="h-full px-4 flex items-center text-text-muted hover:text-text-primary hover:bg-danger transition-colors duration-150"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Loading bar */}
      {isLoading && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none">
          <div className="absolute h-full w-1/2 bg-accent animate-loading-bar" />
        </div>
      )}
    </div>
  );
}
