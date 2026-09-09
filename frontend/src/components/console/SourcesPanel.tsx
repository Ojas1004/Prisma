import {
  FileText,
  FileType,
  Image as ImageIcon,
  Info,
  Loader2,
  PanelLeftClose,
  Plus,
  X,
} from "lucide-react";
import type { SourceItem, SourceKind } from "./types";

function KindIcon({ kind }: { kind: SourceKind }) {
  const cls = "w-3.5 h-3.5 text-slate-500 shrink-0";
  if (kind === "image") return <ImageIcon className={cls} aria-hidden="true" />;
  if (kind === "pdf") return <FileType className={cls} aria-hidden="true" />;
  return <FileText className={cls} aria-hidden="true" />;
}

function sizeLabel(s: SourceItem): string {
  if (s.file) return `${(s.file.size / 1e6).toFixed(1)} MB`;
  return "TXT";
}

/** Persisted rows carry a server-computed byte count; a session-only image
 * carries its File size. */
function bytesOf(s: SourceItem): number {
  return s.sizeBytes || s.file?.size || 0;
}

/** Scale the unit to the value: pasted text is measured in bytes and KB, so a
 * fixed "MB" readout would sit at 0.0 no matter how many sources were saved. */
function storageLabel(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** Left panel: real source ingestion. Checked sources feed the next
 * transform; "+ Add sources" opens the real add-source flow (paste text
 * or pick an actual file), never mock rows. */
export function SourcesPanel({
  sources,
  loading = false,
  error = "",
  onAdd,
  onToggle,
  onToggleAll,
  onDelete,
  onCollapse,
}: {
  sources: SourceItem[];
  /** True while the initial per-user fetch is in flight. */
  loading?: boolean;
  error?: string;
  onAdd: () => void;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onDelete: (id: string) => void;
  onCollapse?: () => void;
}) {
  const checkedCount = sources.filter((s) => s.checked).length;
  const allChecked = sources.length > 0 && checkedCount === sources.length;
  const totalBytes = sources.reduce((n, s) => n + bytesOf(s), 0);
  const hasSources = sources.length > 0;

  return (
    <section className="flex-1 min-h-0 flex flex-col bg-hud-surface rounded-lg border border-hud-border overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-hud-border flex items-center justify-between bg-hud-elevated/40">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-xs bg-hud-cyan shadow-[0_0_6px_#22d3ee]" />
          <h2 className="text-xs font-mono font-semibold tracking-widest text-cyan-400 uppercase">
            SOURCES
          </h2>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="text-slate-500 hover:text-slate-300 p-1 hover:bg-slate-800/40 rounded transition"
            aria-label="Collapse sources panel"
          >
            <PanelLeftClose size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="p-5 space-y-4">
        <button
          type="button"
          onClick={onAdd}
          className="group relative w-full py-3 px-4 rounded border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-400 text-cyan-300 text-xs font-mono tracking-wide font-medium flex items-center justify-center gap-2.5 transition-all duration-200 shadow-[0_0_12px_rgba(34,211,238,0.08)] hover:shadow-[0_0_18px_rgba(34,211,238,0.22)] active:scale-[0.98]"
        >
          <Plus
            size={16}
            className="text-hud-cyan transition-transform duration-300 group-hover:rotate-90"
            aria-hidden="true"
          />
          <span className="tracking-wider">+ Add sources</span>
        </button>
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1 pt-1">
          <span>PIPELINE BUFFER</span>
          <span
            className={`px-2 py-0.5 rounded border transition-all duration-300 ${
              checkedCount > 0
                ? "text-cyan-300 bg-cyan-500/20 border-cyan-400"
                : "text-cyan-400/80 bg-cyan-500/10 border-cyan-500/20"
            }`}
          >
            {checkedCount} / 16 SLOTS ACTIVE
          </span>
        </div>
        {sources.length > 1 && (
          <div className="flex justify-end px-1">
            <button
              type="button"
              onClick={() => onToggleAll(!allChecked)}
              className="text-[10px] font-mono text-slate-500 hover:text-cyan-300 tracking-wider transition"
            >
              {allChecked ? "CLEAR ALL" : "SELECT ALL"}
            </button>
          </div>
        )}
      </div>

      {/* Source list + info empty-state */}
      <div className="px-5 py-2 flex-1 min-h-0 flex flex-col justify-start space-y-3 overflow-y-auto">
        {error && (
          <p
            role="alert"
            className="p-2.5 rounded bg-red-950/40 border border-red-500/40 text-[11px] font-mono text-red-300 leading-relaxed"
          >
            {error}
          </p>
        )}

        {hasSources && (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li
                key={s.id}
                className="p-2.5 rounded bg-hud-elevated/70 border border-hud-border flex items-center justify-between text-xs font-mono transition-all duration-300 hover:border-cyan-500/40"
              >
                <label className="flex items-center gap-2 overflow-hidden cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.checked}
                    onChange={() => onToggle(s.id)}
                    aria-label={`Include ${s.title}`}
                    className="rounded-sm accent-[#22d3ee] cursor-pointer"
                  />
                  <KindIcon kind={s.kind} />
                  <span className="truncate text-slate-300 font-medium text-[11px]">{s.title}</span>
                </label>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] text-cyan-400/80 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/20">
                    {sizeLabel(s)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(s.id)}
                    className="text-slate-500 hover:text-red-400 p-0.5"
                    aria-label={`Remove source ${s.title}`}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* The initial per-user fetch shows here rather than letting the
            "no sources" copy flash before the list arrives. */}
        <div className="relative p-4 rounded bg-hud-elevated/60 border border-hud-border/80 bracket-dim group hover:border-cyan-500/30 transition-colors">
          <span className="hud-bracket-tl" />
          <span className="hud-bracket-tr" />
          <span className="hud-bracket-bl" />
          <span className="hud-bracket-br" />
          <div className="flex items-start gap-3">
            {loading ? (
              <>
                <Loader2
                  size={16}
                  className="text-cyan-400 shrink-0 mt-0.5 animate-spin"
                  aria-hidden="true"
                />
                <p
                  className="text-[11px] font-mono text-cyan-300/90 leading-relaxed tracking-wider"
                  role="status"
                >
                  LOADING SOURCES…
                </p>
              </>
            ) : (
              <>
                <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-[11px] font-mono text-slate-400 leading-relaxed">
                  Saved sources appear here. Checked sources are automatically ingested into your
                  next transform sequence.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer status bar */}
      <div className="p-3 border-t border-hud-border bg-hud-elevated/30 text-[10px] font-mono text-slate-500 flex justify-between items-center">
        <span className={hasSources ? "text-cyan-400 transition-colors duration-300" : "transition-colors duration-300"}>
          STORAGE: {storageLabel(totalBytes)}
        </span>
        <span className={hasSources ? "text-cyan-400 font-semibold" : "text-slate-400"}>
          {hasSources ? "ONLINE" : "READY"}
        </span>
      </div>
    </section>
  );
}
