import { useState } from "react";
import { X, Plus, Trash2, Globe, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useServicesStore } from "@/store/services";
import { SERVICES, type ServiceDefinition } from "@/services/serviceRegistry";

type ServiceCategory = NonNullable<ServiceDefinition["category"]>;

// ── Category picker (Video / Music) ───────────────────────────────────────────

function CategoryPicker({
  value,
  onChange,
}: {
  value: ServiceCategory;
  onChange: (next: ServiceCategory) => void;
}) {
  const opt = (cat: ServiceCategory, label: string) => (
    <button
      key={cat}
      type="button"
      onClick={() => onChange(cat)}
      className={cn(
        "px-3 py-1 rounded-md text-xs font-medium transition-colors duration-150",
        value === cat
          ? "bg-accent text-white"
          : "text-text-muted hover:text-text-primary hover:bg-bg-overlay",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="shrink-0 flex items-center gap-0.5 bg-bg-elevated border border-border-base rounded-lg p-0.5">
      {opt("video", "Video")}
      {opt("music", "Music")}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function faviconFromUrl(raw: string): string {
  try {
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const { hostname } = new URL(url);
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  } catch {
    return "";
  }
}

function normaliseUrl(raw: string): string {
  return /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
}

function sortByLabel(a: ServiceDefinition, b: ServiceDefinition) {
  return a.label.localeCompare(b.label);
}

// ── Favicon image with Globe fallback ─────────────────────────────────────────

function FaviconImg({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return <Globe className="size-6 text-text-disabled shrink-0" />;
  return (
    <img
      src={src}
      alt={alt}
      className="size-6 shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-text-disabled tracking-widest uppercase mb-2 px-0.5">
      {children}
    </p>
  );
}

// ── Square card grid ──────────────────────────────────────────────────────────

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2";

// ── Predefined service card ───────────────────────────────────────────────────

function ServiceCard({
  service,
  selected,
  onToggle,
}: {
  service: ServiceDefinition;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      title={service.label}
      className={cn(
        "relative aspect-square flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border-2",
        "transition-all duration-150 cursor-pointer focus-visible:outline-none w-full",
        selected
          ? "border-accent bg-accent-dim"
          : "border-border-base bg-bg-elevated hover:border-border-strong hover:bg-bg-overlay",
      )}
    >
      {selected && (
        <span className="absolute top-1.5 right-1.5 flex items-center justify-center size-3.5 rounded-full bg-accent">
          <Check className="size-2 text-white" strokeWidth={3} />
        </span>
      )}
      <FaviconImg src={service.faviconUrl} alt={service.label} />
      <span
        className={cn(
          "text-[10px] font-medium text-center leading-tight w-full truncate px-0.5",
          selected ? "text-text-primary" : "text-text-muted",
        )}
      >
        {service.label}
      </span>
    </button>
  );
}

// ── Custom service card (same square format + hover toolbar) ──────────────────

function CustomServiceCard({
  service,
  selected,
  isEditing,
  onToggle,
  onEdit,
  onDelete,
}: {
  service: ServiceDefinition;
  selected: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative group">
      <button
        onClick={onToggle}
        title={service.label}
        className={cn(
          "relative aspect-square w-full flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border-2",
          "transition-all duration-150 cursor-pointer focus-visible:outline-none",
          isEditing && "ring-2 ring-offset-1 ring-offset-bg-base ring-accent",
          selected
            ? "border-accent bg-accent-dim"
            : "border-border-base bg-bg-elevated hover:border-border-strong hover:bg-bg-overlay",
        )}
      >
        {selected && (
          <span className="absolute top-1.5 right-1.5 flex items-center justify-center size-3.5 rounded-full bg-accent">
            <Check className="size-2 text-white" strokeWidth={3} />
          </span>
        )}
        <FaviconImg src={service.faviconUrl} alt={service.label} />
        <span
          className={cn(
            "text-[10px] font-medium text-center leading-tight w-full truncate px-0.5",
            selected ? "text-text-primary" : "text-text-muted",
          )}
        >
          {service.label}
        </span>
      </button>

      {/* Hover toolbar */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 py-1 px-1 rounded-b-xl",
          "bg-bg-base/80 backdrop-blur-sm",
          "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto",
          "transition-opacity duration-150",
        )}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-bg-overlay transition-colors duration-150"
        >
          <Pencil className="size-2.5" />
          Edit
        </button>
        <div className="w-px h-3 bg-border-base shrink-0" />
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-text-muted hover:text-danger hover:bg-bg-overlay transition-colors duration-150"
        >
          <Trash2 className="size-2.5" />
        </button>
      </div>
    </div>
  );
}

// ── Inline edit panel ─────────────────────────────────────────────────────────

function EditPanel({
  editUrl,
  editLabel,
  editCategory,
  faviconPreview,
  onUrlChange,
  onLabelChange,
  onCategoryChange,
  onSave,
  onCancel,
}: {
  editUrl: string;
  editLabel: string;
  editCategory: ServiceCategory;
  faviconPreview: string;
  onUrlChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onCategoryChange: (v: ServiceCategory) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-2 p-3 bg-bg-elevated rounded-xl border border-border-strong">
      <div className="size-7 flex items-center justify-center shrink-0">
        {faviconPreview ? (
          <img src={faviconPreview} alt="" className="size-6" onError={() => {}} />
        ) : (
          <Globe className="size-5 text-text-disabled" />
        )}
      </div>
      <input
        type="url"
        value={editUrl}
        onChange={(e) => onUrlChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSave()}
        placeholder="https://example.com"
        autoFocus
        className="flex-1 bg-bg-overlay border border-border-base rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-accent transition-colors duration-150 min-w-0"
      />
      <input
        type="text"
        value={editLabel}
        onChange={(e) => onLabelChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSave()}
        placeholder="Label"
        className="w-28 shrink-0 bg-bg-overlay border border-border-base rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-accent transition-colors duration-150"
      />
      <CategoryPicker value={editCategory} onChange={onCategoryChange} />
      <button
        onClick={onSave}
        className="shrink-0 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors duration-150"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="shrink-0 px-3 py-1.5 bg-bg-overlay border border-border-base text-text-muted hover:text-text-primary text-sm rounded-lg transition-colors duration-150"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function ServiceWizard() {
  const { enabledIds, customServices, saveServiceConfig, closeWizard, wizardOpen } =
    useServicesStore();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(enabledIds));
  const [pendingCustom, setPendingCustom] = useState<ServiceDefinition[]>(customServices);
  const [selectedCustomIds, setSelectedCustomIds] = useState<Set<string>>(
    new Set(customServices.map((s) => s.id)),
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editCategory, setEditCategory] = useState<ServiceCategory>("video");

  const [customUrl, setCustomUrl] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customCategory, setCustomCategory] = useState<ServiceCategory>("video");
  const [urlError, setUrlError] = useState("");

  const totalSelected = selectedIds.size + selectedCustomIds.size;
  const canClose = enabledIds.length > 0 || customServices.length > 0;
  const editFaviconPreview = faviconFromUrl(editUrl);

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleCustom = (id: string) =>
    setSelectedCustomIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const deleteCustom = (id: string) => {
    setPendingCustom((p) => p.filter((s) => s.id !== id));
    setSelectedCustomIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (editingId === id) cancelEdit();
  };

  const startEdit = (svc: ServiceDefinition) => {
    setEditingId(svc.id);
    setEditUrl(svc.url);
    setEditLabel(svc.label);
    setEditCategory(svc.category === "music" ? "music" : "video");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditUrl("");
    setEditLabel("");
    setEditCategory("video");
  };

  const saveEdit = () => {
    if (!editingId || !editUrl.trim()) return;
    const raw = normaliseUrl(editUrl);
    try {
      const { hostname } = new URL(raw);
      const label =
        editLabel.trim() ||
        hostname.replace(/^www\./, "").split(".")[0].replace(/-/g, " ");
      setPendingCustom((prev) =>
        prev.map((s) =>
          s.id === editingId
            ? {
                ...s,
                url: raw,
                label: label.charAt(0).toUpperCase() + label.slice(1),
                faviconUrl: `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
                category: editCategory,
              }
            : s,
        ),
      );
      cancelEdit();
    } catch {
      // invalid URL — leave panel open
    }
  };

  const buildCustomService = (): ServiceDefinition | null => {
    if (!customUrl.trim()) return null;
    const raw = normaliseUrl(customUrl);
    try {
      const { hostname } = new URL(raw);
      const label =
        customLabel.trim() ||
        hostname.replace(/^www\./, "").split(".")[0].replace(/-/g, " ");
      return {
        id: `custom-${hostname.replace(/\./g, "-")}-${Date.now()}`,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        url: raw,
        faviconUrl: `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
        isCustom: true,
        category: customCategory,
      };
    } catch {
      return null;
    }
  };

  const addCustom = () => {
    const svc = buildCustomService();
    if (!svc) {
      setUrlError("Enter a valid URL (e.g. https://example.com)");
      return;
    }
    setUrlError("");
    setPendingCustom((prev) => [...prev, svc]);
    setSelectedCustomIds((prev) => new Set([...prev, svc.id]));
    setCustomUrl("");
    setCustomLabel("");
    setCustomCategory("video");
  };

  const save = () => {
    if (totalSelected === 0) return;
    const activeCustom = pendingCustom.filter((s) => selectedCustomIds.has(s.id));
    saveServiceConfig(Array.from(selectedIds), activeCustom);
  };

  const videoServices = SERVICES.filter((s) => s.category === "video").sort(sortByLabel);
  const musicServices = SERVICES.filter((s) => s.category === "music").sort(sortByLabel);

  if (!wizardOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-base">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-start justify-between px-8 pt-7 pb-5">
        <div>
          <h1 className="text-base font-semibold text-text-primary tracking-tight">
            Set up your services
          </h1>
          <p className="text-xs text-text-muted mt-1">
            Tap a card to enable or disable a service. Custom services can be
            edited or removed via the card controls.
          </p>
        </div>
        {canClose && (
          <button
            onClick={closeWizard}
            className="mt-0.5 ml-6 shrink-0 text-text-muted hover:text-text-primary transition-colors duration-150 p-1 rounded-md hover:bg-bg-elevated"
            aria-label="Close settings"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-8 pb-4">
        {/* Video */}
        <div className="mb-6">
          <SectionLabel>Video streaming</SectionLabel>
          <div className={GRID}>
            {videoServices.map((svc) => (
              <ServiceCard
                key={svc.id}
                service={svc}
                selected={selectedIds.has(svc.id)}
                onToggle={() => toggle(svc.id)}
              />
            ))}
          </div>
        </div>

        {/* Music */}
        <div className="mb-6">
          <SectionLabel>Music streaming</SectionLabel>
          <div className={GRID}>
            {musicServices.map((svc) => (
              <ServiceCard
                key={svc.id}
                service={svc}
                selected={selectedIds.has(svc.id)}
                onToggle={() => toggle(svc.id)}
              />
            ))}
          </div>
        </div>

        {/* Custom */}
        <div>
          <SectionLabel>Custom services</SectionLabel>

          {pendingCustom.length > 0 && (
            <div className="mb-3">
              <div className={GRID}>
                {pendingCustom.map((svc) => (
                  <CustomServiceCard
                    key={svc.id}
                    service={svc}
                    selected={selectedCustomIds.has(svc.id)}
                    isEditing={editingId === svc.id}
                    onToggle={() => toggleCustom(svc.id)}
                    onEdit={() => startEdit(svc)}
                    onDelete={() => deleteCustom(svc.id)}
                  />
                ))}
              </div>

              {editingId && (
                <EditPanel
                  editUrl={editUrl}
                  editLabel={editLabel}
                  editCategory={editCategory}
                  faviconPreview={editFaviconPreview}
                  onUrlChange={setEditUrl}
                  onLabelChange={setEditLabel}
                  onCategoryChange={setEditCategory}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                />
              )}
            </div>
          )}

          {/* Add new custom service */}
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={customUrl}
              onChange={(e) => { setCustomUrl(e.target.value); setUrlError(""); }}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
              placeholder="https://example.com"
              className={cn(
                "flex-1 bg-bg-elevated border rounded-lg px-3 py-2 text-sm text-text-primary",
                "placeholder:text-text-disabled outline-none focus:border-accent transition-colors duration-150",
                urlError ? "border-danger" : "border-border-base",
              )}
            />
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
              placeholder="Label"
              className="w-28 shrink-0 bg-bg-elevated border border-border-base rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none focus:border-accent transition-colors duration-150"
            />
            <CategoryPicker value={customCategory} onChange={setCustomCategory} />
            <button
              onClick={addCustom}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-bg-elevated hover:bg-bg-overlay border border-border-base rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
            >
              <Plus className="size-3.5" />
              Add
            </button>
          </div>
          {urlError && <p className="text-xs text-danger mt-1.5">{urlError}</p>}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 px-8 py-5 border-t border-border-base">
        <button
          onClick={save}
          disabled={totalSelected === 0}
          className={cn(
            "w-full py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-150",
            totalSelected > 0
              ? "bg-accent hover:bg-accent-hover text-white cursor-pointer"
              : "bg-bg-elevated text-text-disabled cursor-not-allowed",
          )}
        >
          {totalSelected > 0
            ? `Continue with ${totalSelected} service${totalSelected === 1 ? "" : "s"}`
            : "Select at least one service"}
        </button>
      </div>
    </div>
  );
}
