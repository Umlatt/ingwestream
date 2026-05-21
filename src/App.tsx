import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { TitleBar } from "@/components/TitleBar";
import { Sidebar } from "@/components/Sidebar";
import { WebviewMount } from "@/components/WebviewMount";
import { ServiceWizard } from "@/components/ServiceWizard";
import { ResizeBorder } from "@/components/ResizeBorder";
import { useServicesStore } from "@/store/services";

function App() {
  const initFromStore = useServicesStore((s) => s.initFromStore);
  const setFullscreen = useServicesStore((s) => s.setFullscreen);
  const setLoading = useServicesStore((s) => s.setLoading);
  const wizardOpen = useServicesStore((s) => s.wizardOpen);
  const isFullscreen = useServicesStore((s) => s.isFullscreen);
  const toggleFullscreen = useServicesStore((s) => s.toggleFullscreen);
  const openFlyout = useServicesStore((s) => s.openFlyout);
  const closeFlyout = useServicesStore((s) => s.closeFlyout);

  // Overlay titlebar — shown in fullscreen when mouse hovers near top edge
  const [overlayVisible, setOverlayVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    initFromStore();

    let unlisten: (() => void) | undefined;
    listen<boolean>("fullscreen-changed", (e) => {
      setFullscreen(e.payload);
      if (!e.payload) {
        clearTimeout(hideTimerRef.current);
        setOverlayVisible(false);
      }
      // Belt-and-suspenders: ask Rust to re-apply resize after React has re-rendered
      setTimeout(() => {
        invoke("apply_fullscreen_resize").catch(() => {});
      }, 80);
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  // ESC exits fullscreen when the React UI has focus (the webview has its own
  // listener that fires `ingwe-ctrl://?a=escape`). Reads isFullscreen from the
  // store snapshot so we don't need to re-subscribe on every change.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useServicesStore.getState().isFullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  useEffect(() => {
    const unlistens: Promise<() => void>[] = [];

    // Top edge-enter: mouse near top → show overlay titlebar
    unlistens.push(
      listen("edge-enter", () => {
        clearTimeout(hideTimerRef.current);
        invoke("show_titlebar_overlay", { visible: true }).catch(() => {});
      }),
    );

    // Top edge-leave: mouse moved away → auto-hide after 1.5s
    unlistens.push(
      listen("edge-leave", () => {
        hideTimerRef.current = setTimeout(() => {
          invoke("show_titlebar_overlay", { visible: false }).catch(() => {});
        }, 1500);
      }),
    );

    // Left edge-enter: mouse near left edge → fly out sidebar (fullscreen only)
    unlistens.push(
      listen("edge-left-enter", () => {
        if (useServicesStore.getState().isFullscreen) {
          openFlyout();
        }
      }),
    );

    // Left edge-leave: mouse moved away from left edge → close sidebar after delay
    unlistens.push(
      listen("edge-left-leave", () => {
        hideTimerRef.current = setTimeout(() => {
          if (useServicesStore.getState().isFullscreen) {
            closeFlyout();
          }
        }, 800);
      }),
    );

    // overlay-changed: Rust confirms resize → update React state
    unlistens.push(
      listen<boolean>("overlay-changed", (e) => {
        setOverlayVisible(e.payload);
      }),
    );

    // service-load-finished: webview reports navigation completed → drop loading state
    unlistens.push(
      listen<string>("service-load-finished", () => {
        setLoading(false);
      }),
    );

    return () => {
      clearTimeout(hideTimerRef.current);
      unlistens.forEach((p) => p.then((fn) => fn()));
    };
  }, [openFlyout, closeFlyout, setLoading]);

  return (
    <div className="flex flex-col h-screen bg-bg-base text-text-primary overflow-hidden">
      <ResizeBorder />
      <TitleBar />
      <div className="relative flex-1 overflow-hidden">
        <WebviewMount />
        <Sidebar />
      </div>
      {wizardOpen && <ServiceWizard />}

      {/* Floating titlebar overlay — only in fullscreen when mouse is near top */}
      {isFullscreen && overlayVisible && (
        <div
          className="fixed top-0 inset-x-0 z-[100]"
          onMouseEnter={() => clearTimeout(hideTimerRef.current)}
          onMouseLeave={() => {
            hideTimerRef.current = setTimeout(() => {
              invoke("show_titlebar_overlay", { visible: false }).catch(() => {});
            }, 500);
          }}
        >
          <TitleBar forceShow />
        </div>
      )}
    </div>
  );
}

export default App;
