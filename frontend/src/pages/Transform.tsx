import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { HudHeader } from "@/components/console/HudHeader";
import { SourcesPanel } from "@/components/console/SourcesPanel";
import { StudioPanel } from "@/components/console/StudioPanel";
import { TransformConsole } from "@/components/console/TransformConsole";
import { AddSourceModal } from "@/components/console/AddSourceModal";
import { CalibrationPopover } from "@/components/console/CalibrationPopover";
import type {
  SourceDraft,
  SourceItem,
  StudioOutput,
  Turn,
  TypeState,
} from "@/components/console/types";
import {
  connectStream,
  createSource,
  deleteArtifact,
  deleteSource,
  deleteTransform,
  getOutputTypes,
  getTransform,
  listSources,
  retryTransform,
  startTransform,
  uploadSource,
  type SavedSource,
} from "../lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { OutputTypeInfo, ParameterInfo, SSEEvent } from "../lib/types";
import "../styles/console.css";
import "../styles/hud.css";

// Select params start on sensible middles; free-text params start empty.
const PARAM_DEFAULTS: Record<string, string> = {
  tone: "neutral",
  language: "English",
  level_of_detail: "standard",
  content_style: "factual",
  // Matches the backend's configured default (GROQ_REASONING_EFFORT), so the
  // control changes nothing for operators who never touch it.
  reasoning_effort: "high",
};

const EASE = [0.22, 1, 0.36, 1] as const;

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
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // composer + shared selection state
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [params, setParams] = useState<Record<string, string>>(PARAM_DEFAULTS);
  const [calibOpen, setCalibOpen] = useState(false);

  // sources panel — persisted per user in our own Postgres, keyed on the
  // Supabase user id. `sourcesLoading` covers the initial fetch so the panel
  // shows a loading state rather than flashing "no sources" first.
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourcesError, setSourcesError] = useState("");
  const { user, session } = useAuth();
  const token = session?.access_token ?? "";

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
    // The round trip doubles as the header's LATENCY readout — a real
    // measurement of this API, not decorative telemetry.
    const t0 = performance.now();
    getOutputTypes()
      .then(({ output_types, parameters }) => {
        setLatencyMs(Math.round(performance.now() - t0));
        setOutputTypes(output_types);
        setParameters(parameters);
      })
      .catch((err) =>
        setLoadError(`Could not load output types — is the backend running? (${err.message})`),
      );
    return () => closeStream.current();
  }, []);

  /** Saved rows carry text, never a File — a persisted document was already
   * text-extracted server-side at save time, so it feeds a run the same way a
   * pasted source does. */
  const toSourceItem = (s: SavedSource): SourceItem => ({
    id: s.id,
    kind: s.source_type === "image" ? "image" : s.source_type === "pdf" ? "pdf" : "text",
    title: s.title,
    text: s.content_text,
    file: null,
    checked: true,
    sizeBytes: s.size_bytes,
  });

  // Load this user's sources, and clear them the moment the session ends —
  // keyed on user.id so switching accounts refetches rather than showing the
  // previous operator's list. Signing out empties the panel immediately
  // instead of waiting for a fetch that will never come.
  useEffect(() => {
    if (!user || !token) {
      setSources([]);
      setSourcesLoading(false);
      setSourcesError("");
      return;
    }
    let cancelled = false;
    setSourcesLoading(true);
    setSourcesError("");
    listSources(token)
      .then((rows) => {
        if (cancelled) return;
        setSources(rows.map(toSourceItem));
      })
      .catch((err) => {
        if (!cancelled) setSourcesError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token]);

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
    (key: string) => {
      // Not in the backend registry — it is an API parameter, not a prompt one.
      if (key === "reasoning_effort") return "Reasoning effort";
      return parameters.find((p) => p.key === key)?.label ?? key.replace(/_/g, " ");
    },
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
   * backend API: a checked file source wins (one file per run); otherwise
   * checked text sources are concatenated; a bare composer message with
   * nothing checked runs as a free-form prompt. */
  async function runTransform(composerText: string) {
    if (!canSubmit) return;

    const fileSource = checkedSources.find((s) => s.file) ?? null;
    const file = fileSource?.file ?? null;
    const sourceKind: "text" | "prompt" | "pdf" | "image" = file
      ? fileSource!.kind === "text"
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

    const sourceLabels = checkedSources.map((s) => s.title);

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

  function exec() {
    setCalibOpen(false);
    void runTransform(text);
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

  const runningTypes = runningTurn ? Object.keys(runningTurn.typeStates) : [];
  const doneCount = runningTypes.filter((t) =>
    ["ok", "err"].includes(runningTurn?.typeStates[t] ?? ""),
  ).length;
  const runPct = runningTypes.length ? Math.round((doneCount / runningTypes.length) * 100) : 0;

  // HUD status line: idle → buffering (composer holds text) → running.
  const composing = text.trim().length > 0;
  const statusBadge = isRunning
    ? `[ TRANSFORM // ${runPct}% ]`
    : composing
      ? "[ BUFFERING // INGESTING ]"
      : "[ SYS_IDLE // READY ]";
  const statusHot = isRunning || composing;

  // Studio output: one entry per successful artifact across the session.
  const studioOutputs: StudioOutput[] = turns.flatMap((t) =>
    (t.result?.content?.artifacts ?? [])
      .filter((a) => !a.error)
      .map((a) => ({
        turnId: t.id,
        type: a.output_type,
        title: a.title || labelFor(a.output_type),
        // Only set when the ladder actually stepped down; absent otherwise,
        // so the indicator stays invisible on normal runs.
        downgradedTo: a.reasoning_downgrade_reason ? (a.reasoning_applied ?? "") : "",
        // Same digest served every deliverable in a multi-select run, so
        // every row reports the same count — chunking happened once.
        chunkedInto: a.source_chunks ?? 0,
      })),
  );

  /** Persist a new source, then append the row the server returned — the
   * generated id and created_at come from the database, so local state matches
   * what a reload would fetch without re-listing the whole collection. */
  async function addSource(draft: SourceDraft) {
    if (!token) {
      setSourcesError("Not signed in — sources cannot be saved");
      return;
    }
    setAddOpen(false);
    setSourcesError("");

    // An image has no text to persist — it is sent to the vision model as
    // pixels at run time. Keep it in the panel for this session only.
    const imageFile = draft.kind === "image" ? draft.file : null;
    if (imageFile) {
      setSources((prev) => [
        {
          id: crypto.randomUUID(),
          kind: "image",
          title: draft.title,
          text: "",
          file: imageFile,
          checked: true,
          sizeBytes: imageFile.size,
        },
        ...prev,
      ]);
      return;
    }

    try {
      const saved = draft.file
        ? await uploadSource(token, draft.file, draft.title)
        : await createSource(token, {
            title: draft.title,
            source_type: "text",
            content_text: draft.text,
          });
      setSources((prev) => [toSourceItem(saved), ...prev]);
    } catch (err) {
      setSourcesError((err as Error).message);
    }
  }

  /** Delete server-side first; only drop it from the panel once the row is
   * actually gone, so a failed delete doesn't hide a source that still exists. */
  async function removeSource(id: string) {
    // Session-only image rows were never persisted, so there is nothing to
    // delete server-side — drop them locally.
    const item = sources.find((s) => s.id === id);
    if (!token || (item && item.kind === "image" && item.file)) {
      setSources((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    setSourcesError("");
    try {
      await deleteSource(token, id);
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setSourcesError((err as Error).message);
    }
  }

  const panelTransition = reduceMotion ? { duration: 0 } : { duration: 0.4, ease: EASE };

  const sourcesPanel = (onCollapse: () => void) => (
    <SourcesPanel
      sources={sources}
      loading={sourcesLoading}
      error={sourcesError}
      onAdd={() => setAddOpen(true)}
      onToggle={(id) =>
        setSources((prev) => prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s)))
      }
      onToggleAll={(checked) => setSources((prev) => prev.map((s) => ({ ...s, checked })))}
      onDelete={removeSource}
      onCollapse={onCollapse}
    />
  );

  const studioPanel = (onCollapse: () => void) => (
    <StudioPanel
      outputTypes={outputTypes}
      selected={selected}
      onToggleType={toggleType}
      outputs={studioOutputs}
      onOpenOutput={scrollToTurn}
      onCollapse={onCollapse}
    />
  );

  const railClasses =
    "flex-1 min-h-0 bg-hud-surface rounded-lg border border-hud-border flex flex-col items-center pt-3 shadow-2xl";
  const railBtnClasses =
    "text-slate-500 hover:text-cyan-300 p-1.5 hover:bg-slate-800/40 rounded transition";

  return (
    <div className="console-page hud-page">
      <HudHeader />

      <main className="flex-1 min-h-0 flex overflow-hidden p-3 sm:p-5 gap-3 sm:gap-5">
        {/* ── Sources ─────────────────────────────────────── */}
        {!narrow && (
          <motion.aside
            className="flex flex-col shrink-0 min-h-0"
            animate={{ width: sourcesCollapsed ? 64 : 320 }}
            initial={false}
            transition={panelTransition}
          >
            {sourcesCollapsed ? (
              <div className={railClasses}>
                <button
                  className={railBtnClasses}
                  type="button"
                  onClick={() => setSourcesCollapsed(false)}
                  aria-label="Expand sources panel"
                  aria-expanded={false}
                >
                  <PanelLeftOpen size={17} aria-hidden="true" />
                </button>
              </div>
            ) : (
              sourcesPanel(() => setSourcesCollapsed(true))
            )}
          </motion.aside>
        )}

        {/* ── Console ─────────────────────────────────────── */}
        <TransformConsole
          statusBadge={statusBadge}
          statusHot={statusHot}
          latencyMs={latencyMs}
          loadError={loadError}
          turns={turns}
          isRunning={isRunning}
          reduceMotion={!!reduceMotion}
          labelFor={labelFor}
          paramLabel={paramLabel}
          onRetry={onRetry}
          onRemove={onRemove}
          onDeleteJob={onDeleteJob}
          threadRef={threadRef}
          setTurnRef={(id, el) => {
            turnRefs.current[id] = el;
          }}
          text={text}
          onTextChange={setText}
          canSubmit={canSubmit}
          onExec={exec}
          calibrateOpen={calibOpen}
          onToggleCalibrate={() => setCalibOpen((v) => !v)}
          calibration={
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
          }
          onOpenSources={narrow ? () => setDrawer("sources") : undefined}
          onOpenStudio={narrow ? () => setDrawer("studio") : undefined}
        />

        {/* ── Studio ──────────────────────────────────────── */}
        {!narrow && (
          <motion.aside
            className="flex flex-col shrink-0 min-h-0"
            animate={{ width: studioCollapsed ? 64 : 320 }}
            initial={false}
            transition={panelTransition}
          >
            {studioCollapsed ? (
              <div className={railClasses}>
                <button
                  className={railBtnClasses}
                  type="button"
                  onClick={() => setStudioCollapsed(false)}
                  aria-label="Expand studio panel"
                  aria-expanded={false}
                >
                  <PanelRightOpen size={17} aria-hidden="true" />
                </button>
              </div>
            ) : (
              studioPanel(() => setStudioCollapsed(true))
            )}
          </motion.aside>
        )}
      </main>

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
              {drawer === "sources"
                ? sourcesPanel(() => setDrawer(null))
                : studioPanel(() => setDrawer(null))}
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
            onAdd={addSource}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
