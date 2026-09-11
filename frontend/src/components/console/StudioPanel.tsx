import { Inbox, PanelRightClose } from "lucide-react";
import { TypeIcon } from "@/components/ui/ai-chat-input";
import type { OutputTypeInfo } from "@/lib/types";
import type { StudioOutput } from "./types";

const CARD_IDLE =
  "p-3.5 rounded border border-hud-border bg-hud-elevated/40 hover:border-white/40 hover:-translate-y-0.5 hover:shadow-[0_0_12px_rgba(255,255,255,0.1)] text-left transition-all duration-200 group";
const CARD_ACTIVE =
  "p-3.5 rounded border-l-2 border-l-white border-t border-r border-b border-white/50 bg-white/10 text-left shadow-[0_0_12px_rgba(255,255,255,0.18)] -translate-y-0.5 transition-all duration-200 group";

/** Right panel: the deliverable-type grid IS the multi-select for the next
 * transform — cards come from the backend's output-type registry, and the
 * selection drives which artifacts the run generates. Below it, the Studio
 * output list collects every successful artifact of the session. */
export function StudioPanel({
  outputTypes,
  selected,
  onToggleType,
  outputs,
  onOpenOutput,
  onCollapse,
}: {
  outputTypes: OutputTypeInfo[];
  selected: string[];
  onToggleType: (type: string) => void;
  outputs: StudioOutput[];
  onOpenOutput: (turnId: string) => void;
  onCollapse?: () => void;
}) {
  // Odd registry count renders the last card full-width (the mockup's
  // six-plus-one layout, generalized to whatever the backend registers).
  const wideLast = outputTypes.length % 2 === 1;

  return (
    <section className="flex-1 min-h-0 flex flex-col bg-hud-surface rounded-lg border border-hud-border overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-hud-border flex items-center justify-between bg-hud-elevated/40">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-xs bg-hud-cyan shadow-[0_0_6px_#ffffff]" />
          <h2 className="text-xs font-mono font-semibold tracking-widest text-white uppercase">
            STUDIO
          </h2>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="text-neutral-500 hover:text-neutral-300 p-1 hover:bg-neutral-900/40 rounded transition"
            aria-label="Collapse studio panel"
          >
            <PanelRightClose size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Deliverables grid */}
      <div className="p-4 overflow-y-auto space-y-2.5 shrink-0" role="group" aria-label="Deliverable types">
        <div className="grid grid-cols-2 gap-2.5">
          {outputTypes.map((t, i) => {
            const on = selected.includes(t.type);
            const wide = wideLast && i === outputTypes.length - 1;
            return (
              <button
                key={t.type}
                type="button"
                title={t.description}
                aria-pressed={on}
                onClick={() => onToggleType(t.type)}
                className={`${on ? CARD_ACTIVE : CARD_IDLE}${wide ? " col-span-2 flex items-center justify-between" : ""}`}
              >
                {wide ? (
                  <>
                    <span className="flex items-center gap-3">
                      <TypeIcon
                        type={t.type}
                        className={`w-4 h-4 shrink-0 transition ${on ? "text-hud-cyan" : "text-neutral-400 group-hover:text-hud-cyan"}`}
                      />
                      <span
                        className={`block text-[11px] font-mono ${on ? "text-white font-semibold" : "text-neutral-300 font-medium"}`}
                      >
                        {t.label}
                      </span>
                    </span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${on ? "bg-white shadow-[0_0_6px_#ffffff]" : "bg-transparent"}`}
                    />
                  </>
                ) : (
                  <>
                    <span className="flex items-center justify-between mb-2">
                      <TypeIcon
                        type={t.type}
                        className={`w-4 h-4 transition ${on ? "text-hud-cyan" : "text-neutral-400 group-hover:text-hud-cyan"}`}
                      />
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${on ? "bg-white shadow-[0_0_6px_#ffffff]" : "bg-transparent"}`}
                      />
                    </span>
                    <span
                      className={`block text-[11px] font-mono ${on ? "text-white font-semibold" : "text-neutral-300 font-medium"}`}
                    >
                      {t.label}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Studio output header */}
      <div className="px-4 pt-4 pb-2 border-t border-hud-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full transition-colors ${selected.length > 0 ? "bg-hud-cyan shadow-[0_0_6px_#ffffff]" : "bg-neutral-600"}`}
          />
          <h3 className="text-[11px] font-mono tracking-widest text-neutral-400 font-semibold uppercase">
            STUDIO OUTPUT
          </h3>
        </div>
        <span
          className={`text-[10px] font-mono transition-colors ${selected.length > 0 ? "text-white font-medium" : "text-neutral-600"}`}
        >
          {selected.length} TARGETED
        </span>
      </div>

      {/* Output list / empty state */}
      <div className="p-5 flex-1 min-h-0 flex flex-col overflow-y-auto">
        {outputs.length === 0 ? (
          <div className="relative flex-1 p-8 rounded bg-hud-elevated/40 border border-hud-border/70 bracket-dim flex flex-col items-center justify-center text-center group hover:border-white/30 transition-all">
            <span className="hud-bracket-tl" />
            <span className="hud-bracket-tr" />
            <span className="hud-bracket-bl" />
            <span className="hud-bracket-br" />
            <div className="w-10 h-10 rounded-full border border-hud-border bg-hud-surface flex items-center justify-center mb-3 group-hover:border-white/50 group-hover:shadow-[0_0_10px_rgba(255,255,255,0.2)] transition">
              <Inbox
                size={20}
                className="text-neutral-500 group-hover:text-white transition"
                aria-hidden="true"
              />
            </div>
            <p className="text-[10px] font-mono tracking-wider text-neutral-400 uppercase leading-relaxed max-w-45">
              NO DELIVERABLES YET — RUN A TRANSFORM TO SEE OUTPUT HERE
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {outputs.map((o, i) => (
              <li key={`${o.turnId}-${o.type}-${i}`}>
                <button
                  type="button"
                  onClick={() => onOpenOutput(o.turnId)}
                  className="w-full p-2.5 rounded bg-hud-elevated/70 border border-hud-border hover:border-white/40 flex items-start gap-2.5 text-left transition-all duration-200"
                >
                  <TypeIcon type={o.type} className="w-4 h-4 text-hud-cyan shrink-0 mt-0.5" />
                  <span className="flex flex-col gap-0.5 overflow-hidden">
                    <span className="truncate text-[11px] font-mono text-neutral-300 font-medium">
                      {o.title}
                    </span>
                    {/* Expected system behaviour, not a failure — muted
                        metadata styling, never error styling. */}
                    {o.chunkedInto > 0 && (
                      <span className="text-[9px] font-mono text-neutral-500">
                        Chunked into {o.chunkedInto} pieces
                      </span>
                    )}
                    {o.downgradedTo && (
                      <span className="text-[9px] font-mono text-neutral-500">
                        Ran at {o.downgradedTo} effort (budget)
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-hud-border bg-hud-elevated/30 text-[10px] font-mono text-neutral-500 flex justify-between">
        <span>AUTO-EXPORT: OFF</span>
        <span className="text-white/80">CHANNEL #01</span>
      </div>
    </section>
  );
}
