import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  FileText,
  FileType,
  Image as ImageIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import SiteHeader from "../components/SiteHeader";
import { PromptInput, TypeIcon } from "@/components/ui/ai-chat-input";
import {
  connectStream,
  deleteArtifact,
  deleteTransform,
  exportUrl,
  getOutputTypes,
  getTransform,
  retryTransform,
  startTransform,
} from "../lib/api";
import type {
  Artifact,
  OutputTypeInfo,
  ParameterInfo,
  SSEEvent,
  Transform as TransformRow,
} from "../lib/types";
import "../styles/console.css";

type TurnPhase = "generating" | "done" | "failed";
type TypeState = "pending" | "running" | "ok" | "err";
type SourceKind = "text" | "pdf" | "image";

const DETAIL_LEVELS = ["Brief", "Standard", "Comprehensive"];

// Select params start on sensible middles; free-text params start empty.
const PARAM_DEFAULTS: Record<string, string> = {
  tone: "neutral",
  language: "English",
  level_of_detail: "standard",
  content_style: "factual",
};

// Distinct glyph per state so status never depends on colour alone.
const STATUS: Record<TypeState, { glyph: string; className: string; label: string }> = {
  pending: { glyph: "", className: "is-pending", label: "Queued" },
  running: { glyph: "", className: "is-running", label: "Generating…" },
  ok: { glyph: "✓", className: "is-ok", label: "Complete" },
  err: { glyph: "!", className: "is-err", label: "Failed" },
};

const EASE = [0.22, 1, 0.36, 1] as const;
const PREVIEW_LIMIT = 280;

/** One item in the Sources panel. Checked sources feed the next run. */
interface SourceItem {
  id: string;
  kind: SourceKind;
  title: string;
  text: string;
  file: File | null;
  checked: boolean;
}

/** One submission and its outcome — a user request plus the assistant
 * response that answers it. The Chat panel is this list, oldest first;
 * turns are only ever appended or updated in place, never replaced. */
interface Turn {
  id: string; // local id — exists before the backend assigns one
  transformId: string; // backend id, "" until /start resolves
  submittedAt: string;
  sourcePreview: string;
  sourceLabels: string[];
  deliverables: string[];
  parameters: Record<string, string>;
  phase: TurnPhase;
  typeStates: Record<string, TypeState>;
  log: string[];
  error: string;
  result: TransformRow | null;
}

function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export default function Transform() {
  const reduceMotion = useReducedMotion();
  const narrow = useNarrow();
  const [outputTypes, setOutputTypes] = useState<OutputTypeInfo[]>([]);
  const [parameters, setParameters] = useState<ParameterInfo[]>([]);
  const [loadError, setLoadError] = useState("");

  // composer + shared selection state
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [params, setParams] = useState<Record<string, string>>(PARAM_DEFAULTS);
  const [calibOpen, setCalibOpen] = useState(false);

  // sources panel
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  // panel chrome
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [studioCollapsed, setStudioCollapsed] = useState(false);
  const [drawer, setDrawer] = useState<"sources" | "studio" | null>(null);

  // the thread
  const [turns, setTurns] = useState<Turn[]>([]);
  const closeStream = useRef<() => void>(() => {});
  const threadRef = useRef<HTMLDivElement | null>(null);
  const turnRefs = useRef<Record<string, HTMLElement | null>>({});
  // Scroll intent is decided at request time (before the DOM grows) and
  // consumed once the new/updated turn has rendered.
  const pendingScroll = useRef<{ id: string; follow: boolean } | null>(null);

  useEffect(() => {
    getOutputTypes()
      .then(({ output_types, parameters }) => {
        setOutputTypes(output_types);
        setParameters(parameters);
      })
      .catch((err) =>
        setLoadError(`Could not load output types — is the backend running? (${err.message})`),
      );
    return () => closeStream.current();
  }, []);

  // One Escape handler for every transient layer, topmost first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (addOpen) setAddOpen(false);
      else if (calibOpen) setCalibOpen(false);
      else if (drawer) setDrawer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen, calibOpen, drawer]);

  const labelFor = useCallback(
    (type: string) => outputTypes.find((t) => t.type === type)?.label ?? type,
    [outputTypes],
  );

  const paramLabel = useCallback(
    (key: string) => parameters.find((p) => p.key === key)?.label ?? key.replace(/_/g, " "),
    [parameters],
  );

  const updateTurn = useCallback((id: string, fn: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  /** Chat-app follow heuristic on the thread's own scroll container:
   * `force` scrolls unconditionally (a fresh submission or an explicit
   * Studio-output click), otherwise only follow if the reader is already
   * near the bottom — measured NOW, before the thread grows. */
  const requestScroll = useCallback((id: string, force: boolean) => {
    const el = threadRef.current;
    const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    pendingScroll.current = { id, follow: force || nearBottom };
  }, []);

  useEffect(() => {
    const req = pendingScroll.current;
    if (!req) return;
    pendingScroll.current = null;
    if (!req.follow) return;
    const el = threadRef.current;
    const target = turnRefs.current[req.id];
    if (el && target) {
      el.scrollTo({ top: target.offsetTop - 10, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }, [turns, reduceMotion]);

  const scrollToTurn = useCallback(
    (id: string) => {
      setDrawer(null);
      const el = threadRef.current;
      const target = turnRefs.current[id];
      if (el && target) {
        el.scrollTo({ top: target.offsetTop - 10, behavior: reduceMotion ? "auto" : "smooth" });
      }
    },
    [reduceMotion],
  );

  const finishFromServer = useCallback(
    async (localId: string, id: string) => {
      try {
        const t = await getTransform(id);
        requestScroll(localId, false);
        updateTurn(localId, (turn) => {
          // Authoritative per-type states from the stored bundle.
          const typeStates = { ...turn.typeStates };
          if (t.content) {
            for (const a of t.content.artifacts) typeStates[a.output_type] = a.error ? "err" : "ok";
          }
          return {
            ...turn,
            result: t,
            typeStates,
            phase: t.status === "completed" ? "done" : "failed",
            error: t.status === "completed" ? "" : t.error_message || "generation failed",
          };
        });
      } catch (err) {
        updateTurn(localId, (turn) => ({
          ...turn,
          phase: "failed",
          error: (err as Error).message,
        }));
      }
    },
    [requestScroll, updateTurn],
  );

  const watch = useCallback(
    (localId: string, id: string) => {
      closeStream.current();
      closeStream.current = connectStream(
        id,
        (ev: SSEEvent) => {
          updateTurn(localId, (turn) => {
            const next = { ...turn, log: [...turn.log, ev.message || ev.step] };
            if (ev.output_type) {
              // Per-type progress — a failed type is NOT terminal for the job.
              const state: TypeState =
                ev.status === "completed" ? "ok" : ev.status === "failed" ? "err" : "running";
              next.typeStates = { ...turn.typeStates, [ev.output_type]: state };
            }
            return next;
          });
          if (!ev.output_type) {
            if (ev.status === "failed" || (ev.step === "pipeline" && ev.status === "completed")) {
              void finishFromServer(localId, id);
            }
          }
        },
        // Stream closed without a terminal event (e.g. network blip) — ask the server.
        () => void finishFromServer(localId, id),
      );
    },
    [finishFromServer, updateTurn],
  );

  function toggleType(type: string) {
    setSelected((prev) => {
      const next = prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type];
      // Keep registry order regardless of click order.
      return outputTypes.map((t) => t.type).filter((t) => next.includes(t));
    });
  }

  function optionsFromParams(): Record<string, string> {
    return Object.fromEntries(Object.entries(params).filter(([, v]) => v.trim() !== ""));
  }

  const checkedSources = sources.filter((s) => s.checked);
  const runningTurn = turns.find((t) => t.phase === "generating");
  const isRunning = runningTurn !== undefined;
  const hasSubmittable =
    text.trim() !== "" || checkedSources.some((s) => s.file || s.text.trim() !== "");
  const canSubmit = !isRunning && selected.length > 0 && hasSubmittable;

  /** Maps composer text + checked sources onto the unchanged single-source
   * backend API: a composer attachment or checked file source wins (one file
   * per run); otherwise checked text sources are concatenated; a bare
   * composer message with nothing checked runs as a free-form prompt. */
  async function runTransform(composerText: string, attachments: File[]) {
    if (!canSubmit && !(attachments.length > 0 && selected.length > 0 && !isRunning)) return;

    const attachment = attachments[0] ?? null;
    const fileSource = attachment ? null : (checkedSources.find((s) => s.file) ?? null);
    const file = attachment ?? fileSource?.file ?? null;
    const sourceKind: "text" | "prompt" | "pdf" | "image" = file
      ? attachment
        ? "image"
        : fileSource!.kind === "text"
          ? "pdf"
          : (fileSource!.kind as "pdf" | "image")
      : checkedSources.some((s) => s.text.trim() !== "")
        ? "text"
        : "prompt";

    const textParts = checkedSources
      .filter((s) => !s.file && s.text.trim() !== "")
      .map((s, _, all) => (all.length > 1 ? `## ${s.title}\n\n${s.text}` : s.text));
    if (composerText.trim()) textParts.push(composerText.trim());
    const bodyText = textParts.join("\n\n");

    const sourceLabels = [
      ...(attachment ? [attachment.name] : []),
      ...checkedSources.map((s) => s.title),
    ];

    const localId = crypto.randomUUID();
    const turn: Turn = {
      id: localId,
      transformId: "",
      submittedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      sourcePreview: composerText.trim(),
      sourceLabels,
      deliverables: [...selected],
      parameters: optionsFromParams(),
      phase: "generating",
      typeStates: Object.fromEntries(selected.map((t) => [t, "pending" as TypeState])),
      log: [],
      error: "",
      result: null,
    };
    requestScroll(localId, true);
    setTurns((prev) => [...prev, turn]);
    try {
      const { id } = await startTransform({
        source_kind: sourceKind,
        text: bodyText,
        output_types: selected,
        options: optionsFromParams(),
        file,
      });
      updateTurn(localId, (t) => ({ ...t, transformId: id }));
      setText("");
      watch(localId, id);
    } catch (err) {
      updateTurn(localId, (t) => ({ ...t, phase: "failed", error: (err as Error).message }));
    }
  }

  async function onRetry(turn: Turn, types: string[]) {
    if (!turn.transformId || isRunning) return;
    updateTurn(turn.id, (t) => {
      const typeStates = { ...t.typeStates };
      const targets =
        types.length > 0 ? types : Object.keys(typeStates).filter((k) => typeStates[k] !== "ok");
      for (const k of targets.length > 0 ? targets : Object.keys(typeStates)) {
        typeStates[k] = "pending";
      }
      return { ...t, phase: "generating", typeStates, log: [], error: "" };
    });
    try {
      await retryTransform(turn.transformId, types);
      watch(turn.id, turn.transformId);
    } catch (err) {
      updateTurn(turn.id, (t) => ({ ...t, phase: "failed", error: (err as Error).message }));
    }
  }

  async function onRemove(turn: Turn, type: string) {
    if (!turn.transformId) return;
    try {
      const t = await deleteArtifact(turn.transformId, type);
      updateTurn(turn.id, (prev) => ({ ...prev, result: t }));
    } catch (err) {
      updateTurn(turn.id, (prev) => ({ ...prev, error: (err as Error).message }));
    }
  }

  async function onDeleteJob(turn: Turn) {
    try {
      if (turn.transformId) await deleteTransform(turn.transformId);
      delete turnRefs.current[turn.id];
      setTurns((prev) => prev.filter((t) => t.id !== turn.id));
    } catch (err) {
      updateTurn(turn.id, (prev) => ({ ...prev, error: (err as Error).message }));
    }
  }

  const detailLabel =
    DETAIL_LEVELS.find((d) => d.toLowerCase() === (params.level_of_detail ?? "")) ?? "Standard";
  const runningTypes = runningTurn ? Object.keys(runningTurn.typeStates) : [];
  const doneCount = runningTypes.filter((t) =>
    ["ok", "err"].includes(runningTurn?.typeStates[t] ?? ""),
  ).length;
  const runPct = runningTypes.length ? Math.round((doneCount / runningTypes.length) * 100) : 0;

  // Studio output: one entry per successful artifact across the session.
  const studioOutputs = turns.flatMap((t) =>
    (t.result?.content?.artifacts ?? [])
      .filter((a) => !a.error)
      .map((a) => ({ turnId: t.id, type: a.output_type, title: a.title || labelFor(a.output_type) })),
  );

  const panelTransition = reduceMotion ? { duration: 0 } : { duration: 0.4, ease: EASE };

  const sourcesPanel = (
    <SourcesPanel
      sources={sources}
      onAdd={() => setAddOpen(true)}
      onToggle={(id) =>
        setSources((prev) => prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s)))
      }
      onToggleAll={(checked) => setSources((prev) => prev.map((s) => ({ ...s, checked })))}
      onDelete={(id) => setSources((prev) => prev.filter((s) => s.id !== id))}
    />
  );

  const studioPanel = (
    <StudioPanel
      outputTypes={outputTypes}
      selected={selected}
      onToggleType={toggleType}
      outputs={studioOutputs}
      onOpenOutput={scrollToTurn}
    />
  );

  return (
    <div className="console-page">
      <div className="nb-shell">
        {/* No landing section is in view here, so nothing reads as current. */}
        <SiteHeader />

        <div className="nb-panels">
          {/* ── Sources ─────────────────────────────────────── */}
          {!narrow && (
            <motion.aside
              className="nb-col nb-col--sources"
              animate={{ width: sourcesCollapsed ? 64 : 292 }}
              initial={false}
              transition={panelTransition}
            >
              {sourcesCollapsed ? (
                <div className="panel-card panel-card--rail">
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => setSourcesCollapsed(false)}
                    aria-label="Expand sources panel"
                    aria-expanded={false}
                  >
                    <PanelLeftOpen size={17} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="panel-card">
                  <div className="panel-head">
                    <span className="eyebrow">Sources</span>
                    <button
                      className="icon-btn"
                      type="button"
                      onClick={() => setSourcesCollapsed(true)}
                      aria-label="Collapse sources panel"
                      aria-expanded={true}
                    >
                      <PanelLeftClose size={17} aria-hidden="true" />
                    </button>
                  </div>
                  {sourcesPanel}
                </div>
              )}
            </motion.aside>
          )}

          {/* ── Chat ────────────────────────────────────────── */}
          <main className="nb-col nb-col--chat">
            <div className="chat-head">
              {narrow && (
                <button
                  className="icon-btn"
                  type="button"
                  onClick={() => setDrawer("sources")}
                  aria-label="Open sources panel"
                >
                  <PanelLeftOpen size={17} aria-hidden="true" />
                </button>
              )}
              <h1 className="chat-title">Transform Console</h1>
              {narrow && (
                <button
                  className="icon-btn"
                  type="button"
                  onClick={() => setDrawer("studio")}
                  aria-label="Open studio panel"
                >
                  <PanelRightOpen size={17} aria-hidden="true" />
                </button>
              )}
            </div>

            {loadError && (
              <div className="console-card console-card--alert" style={{ marginBottom: 12 }}>
                <p className="error-note">{loadError}</p>
              </div>
            )}

            <div className="nb-thread" ref={threadRef} aria-label="Transform history">
              {turns.length === 0 ? (
                <p className="thread-empty">Your transforms will appear here.</p>
              ) : (
                turns.map((turn) => (
                  <motion.article
                    className="turn"
                    key={turn.id}
                    ref={(el) => {
                      turnRefs.current[turn.id] = el;
                    }}
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
                ))
              )}
            </div>

            {/* ── Composer ──────────────────────────────────── */}
            <div className="nb-composer">
              <AnimatePresence>
                {calibOpen && (
                  <CalibrationPopover
                    parameters={parameters}
                    params={params}
                    setParams={setParams}
                    onClose={() => setCalibOpen(false)}
                    reduceMotion={!!reduceMotion}
                  />
                )}
              </AnimatePresence>
              <PromptInput
                alwaysExpanded
                value={text}
                onChange={setText}
                placeholder={
                  checkedSources.length > 0
                    ? "Add instructions for the checked sources (optional)…"
                    : "Paste source content or describe what you need…"
                }
                outputTypes={outputTypes.map((t) => ({ type: t.type, label: t.label }))}
                selectedTypes={selected}
                onToggleType={toggleType}
                efforts={DETAIL_LEVELS}
                effort={detailLabel}
                onEffortChange={(label) =>
                  setParams((prev) => ({ ...prev, level_of_detail: label.toLowerCase() }))
                }
                onSubmit={(value, meta) => {
                  setCalibOpen(false);
                  void runTransform(value, meta.attachments);
                }}
                clearOnSubmit
                canSubmit={canSubmit}
                isRunning={isRunning}
                runProgress={runPct}
                hasExternalSource={checkedSources.length > 0}
                onOpenCalibration={() => setCalibOpen((v) => !v)}
                calibrationOpen={calibOpen}
              />
            </div>
          </main>

          {/* ── Studio ──────────────────────────────────────── */}
          {!narrow && (
            <motion.aside
              className="nb-col nb-col--studio"
              animate={{ width: studioCollapsed ? 64 : 344 }}
              initial={false}
              transition={panelTransition}
            >
              {studioCollapsed ? (
                <div className="panel-card panel-card--rail">
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => setStudioCollapsed(false)}
                    aria-label="Expand studio panel"
                    aria-expanded={false}
                  >
                    <PanelRightOpen size={17} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="panel-card">
                  <div className="panel-head">
                    <span className="eyebrow">Studio</span>
                    <button
                      className="icon-btn"
                      type="button"
                      onClick={() => setStudioCollapsed(true)}
                      aria-label="Collapse studio panel"
                      aria-expanded={true}
                    >
                      <PanelRightClose size={17} aria-hidden="true" />
                    </button>
                  </div>
                  {studioPanel}
                </div>
              )}
            </motion.aside>
          )}
        </div>
      </div>

      {/* ── Mobile drawers ──────────────────────────────────── */}
      <AnimatePresence>
        {narrow && drawer && (
          <>
            <motion.div
              className="drawer-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
              onClick={() => setDrawer(null)}
            />
            <motion.div
              className={`drawer drawer--${drawer === "sources" ? "left" : "right"}`}
              role="dialog"
              aria-modal="true"
              aria-label={drawer === "sources" ? "Sources" : "Studio"}
              initial={{ x: drawer === "sources" ? "-108%" : "108%" }}
              animate={{ x: 0 }}
              exit={{ x: drawer === "sources" ? "-108%" : "108%" }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.34, ease: EASE }}
            >
              <div className="panel-card panel-card--drawer">
                <div className="panel-head">
                  <span className="eyebrow">{drawer === "sources" ? "Sources" : "Studio"}</span>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => setDrawer(null)}
                    aria-label="Close panel"
                  >
                    <X size={17} aria-hidden="true" />
                  </button>
                </div>
                {drawer === "sources" ? sourcesPanel : studioPanel}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Add-source modal ────────────────────────────────── */}
      <AnimatePresence>
        {addOpen && (
          <AddSourceModal
            reduceMotion={!!reduceMotion}
            onClose={() => setAddOpen(false)}
            onAdd={(item) => {
              setSources((prev) => [...prev, item]);
              setAddOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Sources panel body ─────────────────────────────────────── */

function SourceRowIcon({ kind }: { kind: SourceKind }) {
  if (kind === "image") return <ImageIcon size={15} strokeWidth={2} aria-hidden="true" />;
  if (kind === "pdf") return <FileType size={15} strokeWidth={2} aria-hidden="true" />;
  return <FileText size={15} strokeWidth={2} aria-hidden="true" />;
}

function SourcesPanel({
  sources,
  onAdd,
  onToggle,
  onToggleAll,
  onDelete,
}: {
  sources: SourceItem[];
  onAdd: () => void;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const allChecked = sources.length > 0 && sources.every((s) => s.checked);
  return (
    <div className="panel-body">
      <button className="btn-primary" type="button" onClick={onAdd}>
        <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
        Add sources
      </button>

      {sources.length === 0 ? (
        <p className="panel-hint">
          Saved sources appear here. Checked sources are included in your next transform.
        </p>
      ) : (
        <>
          <label className="src-row src-row--all">
            <span className="src-title">Select all</span>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => onToggleAll(e.target.checked)}
              aria-label="Select all sources"
            />
          </label>
          <ul className="src-list">
            {sources.map((s) => (
              <li key={s.id}>
                <label className="src-row">
                  <span className="src-icon" aria-hidden="true">
                    <SourceRowIcon kind={s.kind} />
                  </span>
                  <span className="src-title">{s.title}</span>
                  <button
                    className="icon-btn icon-btn--sm"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      onDelete(s.id);
                    }}
                    aria-label={`Remove source ${s.title}`}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                  <input
                    type="checkbox"
                    checked={s.checked}
                    onChange={() => onToggle(s.id)}
                    aria-label={`Include ${s.title}`}
                  />
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ── Studio panel body ──────────────────────────────────────── */

function StudioPanel({
  outputTypes,
  selected,
  onToggleType,
  outputs,
  onOpenOutput,
}: {
  outputTypes: OutputTypeInfo[];
  selected: string[];
  onToggleType: (type: string) => void;
  outputs: { turnId: string; type: string; title: string }[];
  onOpenOutput: (turnId: string) => void;
}) {
  return (
    <div className="panel-body">
      <div className="tile-grid" role="group" aria-label="Deliverable types">
        {outputTypes.map((t) => {
          const on = selected.includes(t.type);
          return (
            <button
              key={t.type}
              type="button"
              className={`tile${on ? " is-on" : ""}`}
              onClick={() => onToggleType(t.type)}
              aria-pressed={on}
              title={t.description}
            >
              <TypeIcon type={t.type} className="tile-icon" />
              <span className="tile-label">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="studio-out">
        <span className="eyebrow">Studio output</span>
        {outputs.length === 0 ? (
          <p className="panel-hint">Generated deliverables will be listed here.</p>
        ) : (
          <ul className="out-list">
            {outputs.map((o, i) => (
              <li key={`${o.turnId}-${o.type}-${i}`}>
                <button className="out-row" type="button" onClick={() => onOpenOutput(o.turnId)}>
                  <TypeIcon type={o.type} className="out-icon" />
                  <span className="out-title">{o.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── Calibration popover ────────────────────────────────────── */

function CalibrationPopover({
  parameters,
  params,
  setParams,
  onClose,
  reduceMotion,
}: {
  parameters: ParameterInfo[];
  params: Record<string, string>;
  setParams: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onClose: () => void;
  reduceMotion: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // The toolbar toggle handles its own click; only close on true outside.
      if (ref.current && !ref.current.contains(target) && !target.closest('[aria-label="Calibration settings"]')) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <motion.div
      className="calib-pop"
      ref={ref}
      role="dialog"
      aria-label="Calibration settings"
      initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.16 } }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <div className="panel-head">
        <span className="eyebrow">Calibration</span>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="Close calibration">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="param-grid">
        {parameters.map((p) => (
          <label className="field" key={p.key}>
            <span className="field-label">{p.label}</span>
            {p.kind === "select" ? (
              <select
                value={params[p.key] ?? ""}
                onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
              >
                <option value="">Not set</option>
                {p.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={params[p.key] ?? ""}
                placeholder={p.placeholder}
                onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
              />
            )}
          </label>
        ))}
      </div>
    </motion.div>
  );
}

/* ── Add-source modal ───────────────────────────────────────── */

function AddSourceModal({
  onAdd,
  onClose,
  reduceMotion,
}: {
  onAdd: (item: SourceItem) => void;
  onClose: () => void;
  reduceMotion: boolean;
}) {
  const [kind, setKind] = useState<SourceKind>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const needsFile = kind !== "text";
  const valid = needsFile ? file !== null : body.trim() !== "";

  function add() {
    if (!valid) return;
    onAdd({
      id: crypto.randomUUID(),
      kind,
      title:
        title.trim() ||
        (needsFile ? (file?.name ?? "Untitled") : `${body.trim().slice(0, 42)}${body.trim().length > 42 ? "…" : ""}`),
      text: needsFile ? "" : body,
      file: needsFile ? file : null,
      checked: true,
    });
  }

  return (
    <motion.div
      className="modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Add a source"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className="modal-card"
        initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.16 } }}
        transition={{ duration: 0.34, ease: EASE }}
      >
        <div className="panel-head">
          <span className="eyebrow">Add source</span>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <label className="field">
          <span className="field-label">Source kind</span>
          <select value={kind} onChange={(e) => { setKind(e.target.value as SourceKind); setFile(null); }}>
            <option value="text">Pasted text</option>
            <option value="pdf">Document (PDF / TXT / MD)</option>
            <option value="image">Image</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Title (optional)</span>
          <input
            type="text"
            value={title}
            placeholder="e.g. IMD cyclone advisory"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        {needsFile ? (
          <label className="field">
            <span className="field-label">{kind === "pdf" ? "Document" : "Image"}</span>
            <input
              type="file"
              accept={kind === "pdf" ? ".pdf,.txt,.md" : ".png,.jpg,.jpeg,.webp"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <label className="field">
            <span className="field-label">Source content</span>
            <textarea
              rows={7}
              autoFocus
              placeholder="Paste the article, report, or advisory…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
        )}

        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
          <button className="btn-sm" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" type="button" disabled={!valid} onClick={add}>
            <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
            Add source
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── User turn: a compact request summary, not an input replay ── */

function UserTurn({
  turn,
  labelFor,
  paramLabel,
}: {
  turn: Turn;
  labelFor: (type: string) => string;
  paramLabel: (key: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = turn.sourcePreview.length > PREVIEW_LIMIT;
  const shown =
    expanded || !long
      ? turn.sourcePreview
      : `${turn.sourcePreview.slice(0, PREVIEW_LIMIT).trimEnd()}…`;
  const paramEntries = Object.entries(turn.parameters);

  return (
    <div className="turn-user">
      <div className="turn-user-head">
        <span className="eyebrow">Request</span>
        <span className="turn-time">{turn.submittedAt}</span>
      </div>
      {turn.sourceLabels.length > 0 && (
        <div className="turn-srcs">
          {turn.sourceLabels.map((s, i) => (
            <span className="turn-src" key={i}>
              {s}
            </span>
          ))}
        </div>
      )}
      {shown && <p className="turn-preview">{shown}</p>}
      {long && (
        <button className="turn-more" type="button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      <div className="turn-tags">
        {turn.deliverables.map((t) => (
          <span className="turn-tag" key={t}>
            {labelFor(t)}
          </span>
        ))}
      </div>
      {paramEntries.length > 0 && (
        <details className="turn-params">
          <summary>Parameters</summary>
          <ul>
            {paramEntries.map(([k, v]) => (
              <li key={k}>
                <span className="turn-param-key">{paramLabel(k)}</span> {v}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ── Assistant turn: job status + the deliverable cards ── */

function AssistantTurn({
  turn,
  labelFor,
  isRunning,
  onRetry,
  onRemove,
  onDeleteJob,
}: {
  turn: Turn;
  labelFor: (type: string) => string;
  isRunning: boolean;
  onRetry: (turn: Turn, types: string[]) => void;
  onRemove: (turn: Turn, type: string) => void;
  onDeleteJob: (turn: Turn) => void;
}) {
  const jobTypes = turn.result?.output_types ?? turn.deliverables;
  const showArtifacts = turn.result?.content && turn.phase !== "generating";
  // Actions on one turn stay quiet while another job holds the pipeline.
  const actionsLocked = isRunning;

  return (
    <div className="turn-assistant">
      <section className="console-card" aria-live="polite">
        <span className="eyebrow">{turn.phase === "generating" ? "Running" : "Job status"}</span>
        <ul className="status-list">
          {jobTypes.map((t) => {
            const s = STATUS[turn.typeStates[t] ?? "pending"];
            return (
              <li className="status-row" key={t}>
                <span className={`status-icon ${s.className}`} aria-hidden="true">
                  {s.glyph}
                </span>
                <span className="status-name">{labelFor(t)}</span>
                <span className="status-note">{s.label}</span>
              </li>
            );
          })}
        </ul>
        {turn.phase === "generating" && turn.log.length > 0 && (
          <ul className="run-log">
            {turn.log.slice(-8).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      {turn.phase === "failed" && turn.error && (
        <section className="console-card console-card--alert" aria-live="assertive">
          <span className="eyebrow">Job failed</span>
          <p className="error-note">{turn.error}</p>
          {turn.transformId && (
            <div className="btn-row">
              <button
                className="btn-sm"
                type="button"
                disabled={actionsLocked}
                onClick={() => onRetry(turn, [])}
              >
                Retry
              </button>
            </div>
          )}
        </section>
      )}

      {showArtifacts &&
        turn.result!.content!.artifacts.map((a: Artifact) => (
          <section
            className={`console-card${a.error ? " console-card--alert" : ""}`}
            key={a.output_type}
          >
            <div className="card-head">
              <span className="eyebrow">{labelFor(a.output_type)}</span>
            </div>

            {a.error ? (
              <p className="error-note">{a.error}</p>
            ) : (
              <>
                {a.title && <h2 className="artifact-title">{a.title}</h2>}
                <pre className="artifact-body">{a.body_markdown}</pre>
                {a.highlights.length > 0 && (
                  <ul className="highlights">
                    {a.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                )}
                {Object.keys(a.metadata).length > 0 && (
                  <p className="meta-line">
                    {Object.entries(a.metadata)
                      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                      .join("  ·  ")}
                  </p>
                )}
              </>
            )}

            <div className="btn-row">
              <button
                className="btn-sm"
                type="button"
                disabled={actionsLocked}
                onClick={() => onRetry(turn, [a.output_type])}
              >
                Retry
              </button>
              {!a.error && (
                <a
                  className="btn-sm"
                  href={exportUrl(turn.transformId || turn.result!.id, "md", a.output_type)}
                >
                  Export .md
                </a>
              )}
              {turn.result!.content!.artifacts.length > 1 && (
                <button
                  className="btn-sm"
                  type="button"
                  disabled={actionsLocked}
                  onClick={() => onRemove(turn, a.output_type)}
                >
                  Remove
                </button>
              )}
            </div>
          </section>
        ))}

      {showArtifacts && (
        <div className="btn-row">
          <button
            className="btn-sm"
            type="button"
            disabled={actionsLocked}
            onClick={() => onDeleteJob(turn)}
          >
            Delete job
          </button>
        </div>
      )}
    </div>
  );
}
