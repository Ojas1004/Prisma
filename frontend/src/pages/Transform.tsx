import { useCallback, useEffect, useRef, useState } from "react";
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

type Phase = "idle" | "generating" | "done" | "failed";
type TypeState = "pending" | "running" | "ok" | "err";

const FILE_KINDS = { pdf: ".pdf,.txt,.md", image: ".png,.jpg,.jpeg,.webp" } as const;

// Select params start on sensible middles; free-text params start empty.
const PARAM_DEFAULTS: Record<string, string> = {
  tone: "neutral",
  language: "English",
  level_of_detail: "standard",
  content_style: "factual",
};

const TYPE_BADGE: Record<TypeState, { text: string; className: string }> = {
  pending: { text: "[  ]", className: "dim" },
  running: { text: "[..]", className: "amber" },
  ok: { text: "[OK]", className: "ok" },
  err: { text: "[ERR]", className: "err" },
};

interface TransformProps {
  onHome: () => void;
}

export default function Transform({ onHome }: TransformProps) {
  const [outputTypes, setOutputTypes] = useState<OutputTypeInfo[]>([]);
  const [parameters, setParameters] = useState<ParameterInfo[]>([]);
  const [loadError, setLoadError] = useState("");

  // form state
  const [sourceKind, setSourceKind] = useState<"text" | "prompt" | "pdf" | "image">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [params, setParams] = useState<Record<string, string>>(PARAM_DEFAULTS);

  // generation state
  const [phase, setPhase] = useState<Phase>("idle");
  const [typeStates, setTypeStates] = useState<Record<string, TypeState>>({});
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TransformRow | null>(null);
  const activeId = useRef<string>("");
  const closeStream = useRef<() => void>(() => {});

  useEffect(() => {
    getOutputTypes()
      .then(({ output_types, parameters }) => {
        setOutputTypes(output_types);
        setParameters(parameters);
      })
      .catch((err) => setLoadError(`Could not load output types — is the backend running? (${err.message})`));
    return () => closeStream.current();
  }, []);

  const labelFor = useCallback(
    (type: string) => outputTypes.find((t) => t.type === type)?.label ?? type,
    [outputTypes],
  );

  const finishFromServer = useCallback(async (id: string) => {
    try {
      const t = await getTransform(id);
      setResult(t);
      if (t.content) {
        // Authoritative per-type states from the stored bundle.
        setTypeStates((prev) => {
          const next = { ...prev };
          for (const a of t.content!.artifacts) next[a.output_type] = a.error ? "err" : "ok";
          return next;
        });
      }
      if (t.status === "completed") {
        setPhase("done");
      } else {
        setPhase("failed");
        setError(t.error_message || "generation failed");
      }
    } catch (err) {
      setPhase("failed");
      setError((err as Error).message);
    }
  }, []);

  const watch = useCallback(
    (id: string) => {
      activeId.current = id;
      closeStream.current();
      closeStream.current = connectStream(
        id,
        (ev: SSEEvent) => {
          setLog((prev) => [...prev, `${ev.step}: ${ev.message}`]);
          if (ev.output_type) {
            // Per-type progress — a failed type is NOT terminal for the job.
            const state: TypeState =
              ev.status === "completed" ? "ok" : ev.status === "failed" ? "err" : "running";
            setTypeStates((prev) => ({ ...prev, [ev.output_type!]: state }));
            return;
          }
          if (ev.status === "failed") {
            setPhase("failed");
            setError(ev.message);
            void finishFromServer(id);
          } else if (ev.step === "pipeline" && ev.status === "completed") {
            void finishFromServer(id);
          }
        },
        // Stream closed without a terminal event (e.g. network blip) — ask the server.
        () => {
          if (activeId.current === id) void finishFromServer(id);
        },
      );
    },
    [finishFromServer],
  );

  function toggleType(type: string) {
    setSelected((prev) => {
      const next = prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type];
      // Keep registry order regardless of click order.
      return outputTypes.map((t) => t.type).filter((t) => next.includes(t));
    });
  }

  function optionsFromParams(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(params).filter(([, v]) => v.trim() !== ""),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPhase("generating");
    setTypeStates(Object.fromEntries(selected.map((t) => [t, "pending" as TypeState])));
    setLog([]);
    setError("");
    setResult(null);
    try {
      const { id } = await startTransform({
        source_kind: sourceKind,
        text,
        output_types: selected,
        options: optionsFromParams(),
        file: sourceKind === "pdf" || sourceKind === "image" ? file : null,
      });
      watch(id);
    } catch (err) {
      setPhase("failed");
      setError((err as Error).message);
    }
  }

  async function onRetry(types: string[]) {
    if (!activeId.current) return;
    setPhase("generating");
    setLog([]);
    setError("");
    setTypeStates((prev) => {
      const next = { ...prev };
      const targets = types.length > 0 ? types : Object.keys(prev).filter((t) => prev[t] !== "ok");
      for (const t of targets.length > 0 ? targets : Object.keys(prev)) next[t] = "pending";
      return next;
    });
    try {
      await retryTransform(activeId.current, types);
      watch(activeId.current);
    } catch (err) {
      setPhase("failed");
      setError((err as Error).message);
    }
  }

  async function onRemove(type: string) {
    if (!activeId.current) return;
    try {
      const t = await deleteArtifact(activeId.current, type);
      setResult(t);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onDeleteJob() {
    if (!activeId.current) return;
    try {
      await deleteTransform(activeId.current);
      activeId.current = "";
      setPhase("idle");
      setTypeStates({});
      setLog([]);
      setResult(null);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const needsFile = sourceKind === "pdf" || sourceKind === "image";
  const canSubmit =
    phase !== "generating" &&
    selected.length > 0 &&
    (needsFile ? file !== null : text.trim() !== "");
  const jobTypes = result?.output_types ?? selected;
  const showArtifacts = result?.content && (phase === "done" || phase === "failed");

  return (
    <main className="console">
      <header className="console-header">
        <button className="brand glitch" onClick={onHome}>
          {">"}_ TERMINAL
        </button>
        <span className="dim">:: TRANSFORM CONSOLE</span>
      </header>
      <p className="dim">
        {">"} Submit source content, select output types, tune parameters, run.
      </p>
      {loadError && <p className="err">[ERR] {loadError}</p>}

      <form onSubmit={onSubmit}>
        <fieldset disabled={phase === "generating"} style={{ display: "grid", gap: "1rem" }}>
          <label>
            source_kind:~${" "}
            <select
              value={sourceKind}
              onChange={(e) => {
                setSourceKind(e.target.value as typeof sourceKind);
                setFile(null);
              }}
            >
              <option value="text">Pasted text</option>
              <option value="prompt">Free-form prompt</option>
              <option value="pdf">Document (PDF / TXT / MD)</option>
              <option value="image">Image</option>
            </select>
          </label>

          {needsFile ? (
            <input
              type="file"
              accept={FILE_KINDS[sourceKind as "pdf" | "image"]}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          ) : (
            <textarea
              rows={10}
              placeholder={sourceKind === "prompt" ? "Describe what you need…" : "Paste the source content…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
          {sourceKind === "image" && (
            <textarea
              rows={2}
              placeholder="Optional note about the image…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}

          <div className="pane">
            <p className="pane-title">+--- OUTPUT TYPES ({selected.length} SELECTED) ---+</p>
            <div className="check-grid">
              {outputTypes.map((t) => {
                const checked = selected.includes(t.type);
                return (
                  <label className="check" key={t.type} title={t.description}>
                    <input type="checkbox" checked={checked} onChange={() => toggleType(t.type)} />
                    <span>
                      {checked ? "[x]" : "[ ]"} ./{t.type}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pane">
            <p className="pane-title">+--- GENERATION PARAMETERS ---+</p>
            {parameters.map((p) => (
              <label className="param-row" key={p.key}>
                <span className="param-prompt">{p.key}:~$</span>
                {p.kind === "select" ? (
                  <select
                    className="param-input"
                    value={params[p.key] ?? ""}
                    onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  >
                    <option value="">(unset)</option>
                    {p.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="param-input"
                    value={params[p.key] ?? ""}
                    placeholder={p.placeholder}
                    onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  />
                )}
              </label>
            ))}
          </div>

          <button type="submit" disabled={!canSubmit}>
            {phase === "generating"
              ? "[ GENERATING… ]"
              : `[ RUN TRANSFORM${selected.length > 1 ? ` ×${selected.length}` : ""} ]`}
          </button>
        </fieldset>
      </form>

      {(phase === "generating" || jobTypes.length > 0) && phase !== "idle" && (
        <section>
          <h2>{phase === "generating" ? "Running…" : "Job"}</h2>
          <ul className="type-progress">
            {jobTypes.map((t) => {
              const badge = TYPE_BADGE[typeStates[t] ?? "pending"];
              return (
                <li key={t}>
                  <span className={badge.className}>{badge.text}</span> ./{t}
                </li>
              );
            })}
          </ul>
          {phase === "generating" && (
            <ul className="dim run-log">
              {log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {phase === "failed" && (
        <section>
          <h2 className="err">[ERR] Failed</h2>
          <p>{error}</p>
          {activeId.current && <button onClick={() => onRetry([])}>[ RETRY ]</button>}
        </section>
      )}

      {showArtifacts && (
        <section>
          {result!.content!.artifacts.map((a: Artifact) => (
            <div className="pane artifact-pane" key={a.output_type}>
              <p className="pane-title">+--- {labelFor(a.output_type).toUpperCase()} ---+</p>
              {a.error ? (
                <p className="err">[ERR] {a.error}</p>
              ) : (
                <>
                  {a.title && <h3>{a.title}</h3>}
                  <pre>{a.body_markdown}</pre>
                  {a.highlights.length > 0 && (
                    <ul>
                      {a.highlights.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  )}
                  {Object.keys(a.metadata).length > 0 && (
                    <p className="dim meta-line">
                      {Object.entries(a.metadata)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(" · ")}
                    </p>
                  )}
                </>
              )}
              <p className="pane-actions">
                <button onClick={() => onRetry([a.output_type])}>[ RETRY ]</button>
                {!a.error && (
                  <a href={exportUrl(result!.id, "md", a.output_type)}>[ EXPORT .MD ]</a>
                )}
                {result!.content!.artifacts.length > 1 && (
                  <button onClick={() => onRemove(a.output_type)}>[ REMOVE ]</button>
                )}
              </p>
            </div>
          ))}
          <p>
            <button onClick={onDeleteJob}>[ DELETE JOB ]</button>
          </p>
        </section>
      )}
    </main>
  );
}
