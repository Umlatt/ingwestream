import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { SERVICES, type ServiceDefinition } from "@/services/serviceRegistry";

interface ServicesState {
  activeId: string | null;
  flyoutOpen: boolean;
  isLoading: boolean;
  isFullscreen: boolean;
  wizardOpen: boolean;
  enabledIds: string[];
  customServices: ServiceDefinition[];

  openService: (service: ServiceDefinition) => Promise<void>;
  resetService: (service: ServiceDefinition) => Promise<void>;
  closeService: () => Promise<void>;
  setLoading: (value: boolean) => void;
  openFlyout: () => void;
  toggleFlyout: () => void;
  closeFlyout: () => void;
  toggleFullscreen: () => Promise<void>;
  setFullscreen: (value: boolean) => void;
  openWizard: () => void;
  closeWizard: () => void;
  saveServiceConfig: (
    enabledIds: string[],
    custom: ServiceDefinition[],
  ) => Promise<void>;
  initFromStore: () => Promise<void>;
}

export const useServicesStore = create<ServicesState>((set, get) => ({
  activeId: null,
  flyoutOpen: false,
  isLoading: true,
  isFullscreen: false,
  wizardOpen: false,
  enabledIds: SERVICES.map((s) => s.id), // populated immediately; overridden by initFromStore
  customServices: [],

  openFlyout: () => {
    const { flyoutOpen, activeId } = get();
    if (flyoutOpen) return;
    set({ flyoutOpen: true });
    if (activeId) {
      invoke("hide_service_view").catch((e) =>
        console.error("hide_service_view error:", e),
      );
    }
  },

  toggleFlyout: () => {
    const { flyoutOpen, activeId } = get();
    const opening = !flyoutOpen;
    set({ flyoutOpen: opening });
    if (activeId) {
      invoke(opening ? "hide_service_view" : "show_service_view").catch((e) =>
        console.error("flyout toggle error:", e),
      );
    }
  },

  closeFlyout: () => {
    const { activeId } = get();
    set({ flyoutOpen: false });
    if (activeId) {
      invoke("show_service_view").catch((e) =>
        console.error("show_service_view error:", e),
      );
    }
  },

  openService: async (service) => {
    if (get().isLoading) return;
    const sameService = get().activeId === service.id;
    set({
      activeId: service.id,
      flyoutOpen: false,
      // Only show loading state when actually navigating to a new service.
      // For same-service reopen (sidebar click), there is no page load to wait on.
      isLoading: !sameService,
    });
    try {
      await invoke("open_service", { serviceId: service.id, url: service.url });
      invoke("update_window_icon", { faviconUrl: service.faviconUrl }).catch(
        () => {},
      );
    } catch (e) {
      console.error("[ingwe] open_service failed:", e);
      set({ isLoading: false });
    }
    // Loading state cleared by `service-load-finished` event listener in App.tsx.
  },

  setLoading: (value: boolean) => set({ isLoading: value }),

  resetService: async (service) => {
    if (get().isLoading) return;
    // Always navigate, even if this is already the active service — that's the
    // whole point of "reset to default URL".
    set({ activeId: service.id, flyoutOpen: false, isLoading: true });
    try {
      await invoke("reset_service", { serviceId: service.id, url: service.url });
      invoke("update_window_icon", { faviconUrl: service.faviconUrl }).catch(
        () => {},
      );
    } catch (e) {
      console.error("[ingwe] reset_service failed:", e);
      set({ isLoading: false });
    }
    // Loading state cleared by `service-load-finished` event listener in App.tsx.
  },

  closeService: async () => {
    await invoke("close_service");
    invoke("reset_window_icon").catch(() => {});
    set({ activeId: null });
  },

  toggleFullscreen: async () => {
    await invoke("toggle_fullscreen_layout").catch((e) =>
      console.error("toggle_fullscreen_layout error:", e),
    );
  },

  setFullscreen: (value) => set({ isFullscreen: value }),

  openWizard: () => {
    const { activeId } = get();
    set({ wizardOpen: true, flyoutOpen: false });
    // Hide the native webview so the wizard (React layer) isn't covered
    if (activeId) invoke("hide_service_view").catch(() => {});
  },

  closeWizard: () => {
    const { activeId } = get();
    set({ wizardOpen: false });
    if (activeId) invoke("show_service_view").catch(() => {});
  },

  saveServiceConfig: async (enabledIds, custom) => {
    try {
      const store = await load("ingwe.json", { defaults: {}, autoSave: true });
      await store.set("firstRun", false);
      await store.set("enabledIds", enabledIds);
      await store.set("customServices", custom);
    } catch (e) {
      console.error("[ingwe] saveServiceConfig error:", e);
    }
    const { activeId } = get();
    set({ enabledIds, customServices: custom, wizardOpen: false });
    if (activeId) invoke("show_service_view").catch(() => {});
  },

  initFromStore: async () => {
    try {
      const store = await load("ingwe.json", { defaults: {}, autoSave: true });
      const firstRun = (await store.get<boolean>("firstRun")) ?? true;
      const storedIds = await store.get<string[]>("enabledIds");
      const enabledIds = storedIds ?? SERVICES.map((s) => s.id);
      const customServices =
        (await store.get<ServiceDefinition[]>("customServices")) ?? [];
      set({ enabledIds, customServices, wizardOpen: firstRun, isLoading: false });
    } catch (e) {
      console.error("[ingwe] initFromStore error:", e);
      set({ isLoading: false });
    }
  },
}));

export { SERVICES };

export function useActiveServices(): ServiceDefinition[] {
  const enabledIds = useServicesStore((s) => s.enabledIds);
  const customServices = useServicesStore((s) => s.customServices);
  // Sort the merged list by label so newly added/enabled services slot into
  // alphabetic order rather than appearing at the end (custom) or in registry
  // order (built-in).
  return [
    ...SERVICES.filter((s) => enabledIds.includes(s.id)),
    ...customServices,
  ].sort((a, b) => a.label.localeCompare(b.label));
}
