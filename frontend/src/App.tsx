import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectStream,
  deleteTransform,
  getOutputTypes,
  getTransform,
  imageUrl,
  retryTransform,
  startTransform,
} from "./lib/api";
import type { OutputTypeInfo, SSEEvent, Transform } from "./lib/types";

type Phase = "idle" | "generating" | "done" | "failed";

const FILE_KINDS = { pdf: ".pdf,.txt,.md", image: ".png,.jpg,.jpeg,.webp" } as const;

export default function App() {
  const [outputTypes, setOutputTypes] = useState<OutputTypeInfo[]>([]);
  const [loadError, setLoadError] = useState("");

  // form state
  const [sourceKind, setSourceKind] = useState<"text" | "prompt" | "pdf" | "image">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [outputType, setOutputType] = useState("");

  // generation state
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Transform | null>(null);
  const [imageSrc, setImageSrc] = useState("");
  const activeId = useRef<string>("");
  const closeStream = useRef<() => void>(() => {});

  useEffect(() => {
    getOutputTypes()
      .then(({ output_types }) => {
        setOutputTypes(output_types);
        if (output_types.length > 0) setOutputType(output_types[0].type);
      })
      .catch((err) => setLoadError(`Could not load output types — is the backend running? (${err.message})`));
    return () => closeStream.current();
  }, []);

  const finishFromServer = useCallback(async (id: string) => {
    try {
      const t = await getTransform(id);
      setResult(t);
      if (t.status === "completed") {
        setPhase("done");
        if (t.output_kind === "image") setImageSrc(imageUrl(id));
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
          setProgress((prev) => [...prev, `${ev.step}: ${ev.message}`]);
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPhase("generating");
    setProgress([]);
    setError("");
    setResult(null);
    setImageSrc("");
    try {
      const { id } = await startTransform({
        source_kind: sourceKind,
        text,
        output_type: outputType,
        file: sourceKind === "pdf" || sourceKind === "image" ? file : null,
      });
      watch(id);
    } catch (err) {
      setPhase("failed");
      setError((err as Error).message);
    }
  }

  async function onRetry() {
    if (!activeId.current) return;
    setPhase("generating");
    setProgress([]);
    setError("");
    setImageSrc("");
    try {
      await retryTransform(activeId.current);
      watch(activeId.current);
    } catch (err) {
      setPhase("failed");
      setError((err as Error).message);
    }
  }

  async function onDelete() {
    if (!activeId.current) return;
    try {
      await deleteTransform(activeId.current);
      activeId.current = "";
      setPhase("idle");
      setProgress([]);
      setResult(null);
      setImageSrc("");
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const needsFile = sourceKind === "pdf" || sourceKind === "image";
  const canSubmit =
    phase !== "generating" && outputType !== "" && (needsFile ? file !== null : text.trim() !== "");

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>SIH Transform</h1>
      <p>Submit source content, pick an output type, get a generated artifact.</p>
      {loadError && <p style={{ color: "red" }}>{loadError}</p>}

      <form onSubmit={onSubmit}>
        <fieldset disabled={phase === "generating"} style={{ display: "grid", gap: "0.75rem" }}>
          <label>
            Source kind{" "}
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

          <label>
            Output type{" "}
            <select value={outputType} onChange={(e) => setOutputType(e.target.value)}>
              {outputTypes.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label} ({t.kind})
                </option>
              ))}
            </select>
          </label>

          <button type="submit" disabled={!canSubmit}>
            {phase === "generating" ? "Generating…" : "Generate"}
          </button>
        </fieldset>
      </form>

      {phase === "generating" && (
        <section>
          <h2>Generating…</h2>
          <ul>
            {progress.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {phase === "failed" && (
        <section>
          <h2 style={{ color: "red" }}>Failed</h2>
          <p>{error}</p>
          {activeId.current && <button onClick={onRetry}>Retry</button>}
        </section>
      )}

      {phase === "done" && result?.content && (
        <section>
          <h2>{result.content.title || "Result"}</h2>

          {result.output_kind === "image" ? (
            <>
              {imageSrc && <img src={imageSrc} alt={result.content.title} style={{ maxWidth: "100%" }} />}
              {result.content.body_markdown && <p>{result.content.body_markdown}</p>}
            </>
          ) : (
            <>
              <pre style={{ whiteSpace: "pre-wrap" }}>{result.content.body_markdown}</pre>
              {result.content.highlights.length > 0 && (
                <>
                  <h3>Key points</h3>
                  <ul>
                    {result.content.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          <p>
            <button onClick={onRetry}>Retry</button>{" "}
            <button onClick={onDelete}>Delete</button>
          </p>
        </section>
      )}
    </main>
  );
}
