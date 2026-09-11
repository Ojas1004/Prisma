import { useState, type ReactNode, type RefObject } from "react";
import { motion } from "framer-motion";
import { ArrowUp, Mic, PanelLeftOpen, PanelRightOpen, SlidersHorizontal, Zap } from "lucide-react";
import { AssistantTurn, UserTurn } from "./Turns";
import type { Turn } from "./types";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Source-kind hint chips shown in the empty state. Multi-select is real
 * state (not class-toggling), but the chips are informational — they hint
 * at what the pipeline accepts rather than filtering anything yet. */
const QUICK_CHIPS = ["ARTICLES", "REPORTS", "PDF / DOCS", "IMAGES / VIDEO", "PROMPTS"];

const CHIP_IDLE =
  "text-[10px] font-mono px-3 py-1 rounded bg-hud-elevated border border-hud-border text-neutral-400 hover:border-white/50 hover:text-white hover:-translate-y-0.5 transition-all duration-150 cursor-pointer select-none active:scale-95";
const CHIP_ACTIVE =
  "text-[10px] font-mono px-3 py-1 rounded bg-white/15 border border-white/60 text-white shadow-[0_0_10px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-150 cursor-pointer select-none active:scale-95 font-semibold";

const PILL_ACTIVE =
  "flex items-center gap-2 px-3 py-1.5 rounded text-[11px] font-mono bg-white/10 text-white border border-white/30 shadow-[0_0_8px_rgba(255,255,255,0.15)] transition-all duration-150";
const PILL_IDLE =
  "flex items-center gap-2 px-3 py-1.5 rounded text-[11px] font-mono text-neutral-400 hover:text-neutral-200 border border-transparent hover:border-hud-border transition-all duration-150";

function SonarDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="sonar-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
      <span className="sonar-ping-delayed absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-hud-cyan shadow-[0_0_6px_#ffffff]" />
    </span>
  );
}

export interface TransformConsoleProps {
  statusBadge: string;
  statusHot: boolean;
  latencyMs: number | null;
  loadError: string;
  turns: Turn[];
  isRunning: boolean;
  reduceMotion: boolean;
  labelFor: (type: string) => string;
  paramLabel: (key: string) => string;
  onRetry: (turn: Turn, types: string[]) => void;
  onRemove: (turn: Turn, type: string) => void;
  onDeleteJob: (turn: Turn) => void;
  threadRef: RefObject<HTMLDivElement | null>;
  setTurnRef: (id: string, el: HTMLElement | null) => void;
  // composer
  text: string;
  onTextChange: (v: string) => void;
  canSubmit: boolean;
  onExec: () => void;
  calibrateOpen: boolean;
  onToggleCalibrate: () => void;
  /** The CalibrationPopover node (wrapped in AnimatePresence by the parent). */
  calibration: ReactNode;
  // narrow-viewport drawer triggers
  onOpenSources?: () => void;
  onOpenStudio?: () => void;
}

export function TransformConsole(props: TransformConsoleProps) {
  const {
    statusBadge,
    statusHot,
    latencyMs,
    loadError,
    turns,
    isRunning,
    reduceMotion,
    labelFor,
    paramLabel,
    onRetry,
    onRemove,
    onDeleteJob,
    threadRef,
    setTurnRef,
    text,
    onTextChange,
    canSubmit,
    onExec,
    calibrateOpen,
    onToggleCalibrate,
    calibration,
    onOpenSources,
    onOpenStudio,
  } = props;

  const [chips, setChips] = useState<string[]>([]);
  const composing = text.trim().length > 0;
  const empty = turns.length === 0;

  function toggleChip(label: string) {
    setChips((prev) =>
      prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label],
    );
  }

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-hud-surface rounded-lg border border-hud-border overflow-hidden relative shadow-2xl">
      {/* Console header */}
      <div className="px-4 sm:px-6 py-3 border-b border-hud-border flex items-center justify-between bg-hud-surface gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onOpenSources && (
            <button
              type="button"
              onClick={onOpenSources}
              className="text-neutral-500 hover:text-neutral-300 p-1 hover:bg-neutral-900/40 rounded transition shrink-0"
              aria-label="Open sources panel"
            >
              <PanelLeftOpen size={16} aria-hidden="true" />
            </button>
          )}
          <h1 className="text-sm font-sans font-bold tracking-tight text-white uppercase shrink-0">
            Prisma
          </h1>
          <span
            className={`relative hidden sm:inline-flex items-center gap-2 text-[10px] font-mono text-white bg-neutral-900/40 border px-2.5 py-0.5 rounded tracking-wider transition-all duration-300 ${
              statusHot
                ? "border-white shadow-[0_0_12px_rgba(255,255,255,0.3)]"
                : "border-white/30 shadow-[0_0_8px_rgba(255,255,255,0.15)]"
            }`}
            role="status"
          >
            <SonarDot />
            <span>{statusBadge}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-neutral-500 shrink-0">
          <span>
            LATENCY:{" "}
            <strong className="text-neutral-400 font-normal">
              {latencyMs === null ? "—" : `${latencyMs}ms`}
            </strong>
          </span>
          {onOpenStudio && (
            <button
              type="button"
              onClick={onOpenStudio}
              className="text-neutral-500 hover:text-neutral-300 p-1 hover:bg-neutral-900/40 rounded transition"
              aria-label="Open studio panel"
            >
              <PanelRightOpen size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="px-6 pt-3">
          <p className="error-note">{loadError}</p>
        </div>
      )}

      {/* Workspace viewport: reticle empty state, or the live thread */}
      <div
        ref={threadRef}
        aria-label="Transform history"
        className={
          empty
            ? "flex-1 relative flex flex-col items-center justify-center p-6 bg-hud-grid overflow-hidden"
            : "flex-1 relative p-4 sm:p-6 bg-hud-grid overflow-y-auto"
        }
      >
        {empty ? (
          <>
            {/* Animated scanline */}
            <div className="pointer-events-none absolute inset-0 w-full h-12 bg-linear-to-b from-transparent via-white/10 to-transparent hud-scanline" />

            {/* Center focus reticle */}
            <div className="relative w-full max-w-2xl p-10 sm:p-14 flex flex-col items-center text-center">
              <span className="hud-bracket-tl hud-bracket-active hud-bracket-lg" />
              <span className="hud-bracket-tr hud-bracket-active hud-bracket-lg" />
              <span className="hud-bracket-bl hud-bracket-active hud-bracket-lg" />
              <span className="hud-bracket-br hud-bracket-active hud-bracket-lg" />
              <div className="absolute inset-x-6 top-1/2 h-px bg-white/15 pointer-events-none" />
              <div className="absolute inset-y-6 left-1/2 w-px bg-white/15 pointer-events-none" />

              <div
                className={`relative z-10 flex items-center gap-2.5 mb-4 bg-hud-surface/90 border px-4 py-1.5 rounded-full backdrop-blur transition-all duration-300 ${
                  composing
                    ? "border-white/60 shadow-[0_0_16px_rgba(255,255,255,0.25)]"
                    : "border-white/30 shadow-[0_0_12px_rgba(255,255,255,0.15)] hover:border-white/60"
                }`}
                role="status"
              >
                <SonarDot />
                <span className="text-[11px] font-mono tracking-widest text-white font-semibold uppercase">
                  {composing ? "PAYLOAD INGESTION ACTIVE" : "AWAITING SOURCE INPUT"}
                </span>
              </div>

              <p
                className={`relative z-10 text-xs font-mono max-w-lg mt-2 leading-relaxed transition-colors duration-200 ${
                  composing ? "text-white/90" : "text-neutral-400"
                }`}
              >
                {composing
                  ? `Processing input payload (${text.length} chars). Press ⌘/Ctrl + ↵ to trigger transform sequence.`
                  : "Add a source from the left panel, or paste content directly below to begin."}
              </p>

              <div className="relative z-10 flex flex-wrap gap-2.5 justify-center mt-7">
                {QUICK_CHIPS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={chips.includes(label)}
                    onClick={() => toggleChip(label)}
                    className={chips.includes(label) ? CHIP_ACTIVE : CHIP_IDLE}
                  >
                    [ {label} ]
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="max-w-3xl mx-auto space-y-8">
            {turns.map((turn) => (
              <motion.article
                className="turn"
                key={turn.id}
                ref={(el) => setTurnRef(turn.id, el)}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <UserTurn turn={turn} labelFor={labelFor} paramLabel={paramLabel} />
                <AssistantTurn
                  turn={turn}
                  labelFor={labelFor}
                  isRunning={isRunning}
                  onRetry={onRetry}
                  onRemove={onRemove}
                  onDeleteJob={onDeleteJob}
                />
              </motion.article>
            ))}
          </div>
        )}
      </div>

      {/* Bottom input dock */}
      <div className="relative border-t border-hud-border bg-hud-elevated/90 backdrop-blur p-4 sm:p-5">
        {calibration}
        <InputDock
          text={text}
          onTextChange={onTextChange}
          canSubmit={canSubmit}
          isRunning={isRunning}
          onExec={onExec}
          calibrateOpen={calibrateOpen}
          onToggleCalibrate={onToggleCalibrate}
        />
      </div>
    </section>
  );
}

/* ── Input dock ─────────────────────────────────────────────── */

function InputDock({
  text,
  onTextChange,
  canSubmit,
  isRunning,
  onExec,
  calibrateOpen,
  onToggleCalibrate,
}: {
  text: string;
  onTextChange: (v: string) => void;
  canSubmit: boolean;
  isRunning: boolean;
  onExec: () => void;
  calibrateOpen: boolean;
  onToggleCalibrate: () => void;
}) {
  // Visual recording state only — transcription isn't wired to a backend,
  // and the dock never fabricates transcript text into the composer.
  const [recording, setRecording] = useState(false);

  return (
    <div className="rounded-md border border-hud-border bg-[#0b0b0b] focus-within:border-white/70 focus-within:shadow-[0_0_20px_rgba(255,255,255,0.22)] transition-all duration-200">
      <textarea
        rows={4}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onExec();
          }
        }}
        placeholder="Paste source content or describe what you need..."
        className="block w-full bg-transparent border-0 text-neutral-200 placeholder:text-neutral-600 font-mono text-xs focus:ring-0 resize-none p-4 leading-relaxed outline-hidden"
      />
      <div className="px-4 py-2.5 border-t border-hud-border/50 flex items-center justify-between gap-3">
        {/* Mode / calibration toggles */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={calibrateOpen ? PILL_IDLE : PILL_ACTIVE}
            onClick={() => {
              if (calibrateOpen) onToggleCalibrate();
            }}
            aria-pressed={!calibrateOpen}
          >
            <Zap size={14} className={calibrateOpen ? "" : "text-hud-cyan"} aria-hidden="true" />
            <span>Standard</span>
          </button>
          <button
            type="button"
            data-calibrate-toggle="true"
            className={calibrateOpen ? PILL_ACTIVE : PILL_IDLE}
            onClick={onToggleCalibrate}
            aria-pressed={calibrateOpen}
            aria-label="Calibration settings"
          >
            <SlidersHorizontal
              size={14}
              className={calibrateOpen ? "text-hud-cyan" : ""}
              aria-hidden="true"
            />
            <span>Calibrate</span>
          </button>
        </div>

        {/* Exec + voice */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-neutral-500 hidden sm:inline-block">
            EXEC: <kbd className="text-neutral-400 font-mono">⌘/Ctrl + ↵</kbd>
          </span>
          <button
            type="button"
            onClick={() => setRecording((v) => !v)}
            title="Voice input (visual only — transcription not wired yet)"
            aria-pressed={recording}
            className={`relative group w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-200 active:scale-95 ${
              recording
                ? "border-white bg-white/30 text-white shadow-[0_0_18px_rgba(255,255,255,0.5)]"
                : "border-white/40 bg-white/10 hover:bg-white/20 text-white shadow-[0_0_10px_rgba(255,255,255,0.2)] hover:shadow-[0_0_16px_rgba(255,255,255,0.4)]"
            }`}
          >
            {recording ? (
              <span className="flex items-center justify-center gap-0.5 h-4">
                <span className="recording-bar w-0.5 bg-white rounded-full" />
                <span className="recording-bar w-0.5 bg-white rounded-full" />
                <span className="recording-bar w-0.5 bg-white rounded-full" />
              </span>
            ) : (
              <Mic
                size={16}
                className="text-hud-cyan transition-transform group-hover:scale-110"
                aria-hidden="true"
              />
            )}
          </button>
          <button
            type="button"
            onClick={onExec}
            disabled={!canSubmit}
            title={isRunning ? "A transform is already running" : "Run transform"}
            aria-label="Run transform"
            className="w-8 h-8 rounded-full border border-white/40 bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all duration-200 shadow-[0_0_10px_rgba(255,255,255,0.2)] hover:shadow-[0_0_16px_rgba(255,255,255,0.4)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10"
          >
            <ArrowUp size={16} className="text-hud-cyan" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
