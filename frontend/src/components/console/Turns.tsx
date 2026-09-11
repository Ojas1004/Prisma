import { useState } from "react";
import { exportUrl } from "@/lib/api";
import { shareToLinkedIn, xShareUrl } from "@/lib/share";
import type { Artifact } from "@/lib/types";
import type { Turn, TypeState } from "./types";

const PREVIEW_LIMIT = 280;

// Distinct glyph per state so status never depends on colour alone.
const STATUS: Record<TypeState, { glyph: string; className: string; label: string }> = {
  pending: { glyph: "", className: "is-pending", label: "Queued" },
  running: { glyph: "", className: "is-running", label: "Generating…" },
  ok: { glyph: "✓", className: "is-ok", label: "Complete" },
  err: { glyph: "!", className: "is-err", label: "Failed" },
};

/* ── Share actions ──────────────────────────────────────────────
 * X takes the post text in the intent URL, so it opens prefilled. LinkedIn's
 * share-offsite only accepts a crawlable URL and ignores passed text, so
 * without a public deployment we copy the body and open the composer to paste
 * into. See lib/share.ts for why the two differ. */

function ShareActions({ text, title }: { text: string; title: string }) {
  const [notice, setNotice] = useState("");

  // The post itself is what people want to share; the title is a fallback for
  // artifact types whose body is long-form rather than post-shaped.
  const payload = (text || title).trim();
  if (!payload) return null;

  async function onLinkedIn() {
    const copied = await shareToLinkedIn(payload);
    setNotice(
      copied
        ? "Post copied — paste it into LinkedIn"
        : "Could not copy automatically — copy the text above",
    );
    window.setTimeout(() => setNotice(""), 6000);
  }

  return (
    <>
      <button className="btn-sm" type="button" onClick={onLinkedIn}>
        Share on LinkedIn
      </button>
      <a
        className="btn-sm"
        href={xShareUrl(payload)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Share on X
      </a>
      {notice && <span className="share-note">{notice}</span>}
    </>
  );
}

/* ── User turn: a compact request summary, not an input replay ── */

export function UserTurn({
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

export function AssistantTurn({
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
              {!a.error && <ShareActions text={a.body_markdown} title={a.title} />}
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
