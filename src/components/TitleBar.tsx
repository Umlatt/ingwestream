import { useRef, useState } from "react";
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { LayoutGrid, Minus, X, Expand, Shrink, Square, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServicesStore, useActiveServices } from "@/store/services";

type SavedBounds = {
  position: PhysicalPosition;
  size: PhysicalSize;
};

type WorkArea = { x: number; y: number; width: number; height: number };

export function TitleBar({ forceShow = false }: { forceShow?: boolean }) {
  const win = getCurrentWindow();
  const toggleFlyout = useServicesStore((s) => s.toggleFlyout);
  const toggleFullscreen = useServicesStore((s) => s.toggleFullscreen);
  const activeId = useServicesStore((s) => s.activeId);
  const isLoading = useServicesStore((s) => s.isLoading);
  const isFullscreen = useServicesStore((s) => s.isFullscreen);
  const services = useActiveServices();

  // Soft-maximise: instead of WS_MAXIMIZE (which corrupts the Windows taskbar
  // rendering on frameless windows, tauri#7103), we resize the window to fit
  // the monitor's work area ourselves. The previous bounds are stashed so the
  // restore action can put the window back exactly where it was.
  const [isMaximized, setIsMaximized] = useState(false);
  const savedBoundsRef = useRef<SavedBounds | null>(null);

  const toggleMaximize = async () => {
    try {
      if (isMaximized && savedBoundsRef.current) {
        const { position, size } = savedBoundsRef.current;
        await win.setPosition(position);
        await win.setSize(size);
        savedBoundsRef.current = null;
        setIsMaximized(false);
        return;
      }
      const [position, size] = await Promise.all([
        win.outerPosition(),
        win.outerSize(),
      ]);
      savedBoundsRef.current = { position, size };
      const wa = await invoke<WorkArea>("get_work_area");
      await win.setPosition(new PhysicalPosition(wa.x, wa.y));
      await win.setSize(new PhysicalSize(wa.width, wa.height));
      setIsMaximized(true);
    } catch (e) {
      console.error("[ingwe] toggleMaximize failed:", e);
    }
  };

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
        {/* In the fullscreen overlay (forceShow) render a prominent labeled exit button */}
        {forceShow && isFullscreen ? (
          <button
            onClick={toggleFullscreen}
            className="h-full px-4 flex items-center gap-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors duration-150"
            aria-label="Exit fullscreen"
          >
            <Shrink className="size-3.5" />
            <span className="text-xs font-medium">Exit Fullscreen</span>
          </button>
        ) : (
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
        )}
        <button
          onClick={() => win.minimize()}
          className="h-full px-4 flex items-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors duration-150"
          aria-label="Minimise"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          onClick={toggleMaximize}
          className="h-full px-4 flex items-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors duration-150"
          aria-label={isMaximized ? "Restore" : "Maximise"}
        >
          {isMaximized ? (
            <Copy className="size-3 -scale-x-100" />
          ) : (
            <Square className="size-3" />
          )}
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
        <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden pointer-events-none">
          <div className="absolute h-full w-1/2 bg-accent animate-loading-bar" />
        </div>
      )}
    </div>
  );
}
