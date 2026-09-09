import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import type { SourceDraft, SourceKind } from "./types";

const EASE = [0.22, 1, 0.36, 1] as const;

/** The real source-ingestion flow: pasted text, or an actual File picked
 * from disk (PDF/TXT/MD or image). No mock rows — what lands in the panel
 * is what feeds the next transform.
 *
 * This emits a draft rather than a finished SourceItem: the caller persists it
 * and adopts the row the server returns, so the item's id is the database id
 * rather than a client-side uuid that would not survive a reload. */
export function AddSourceModal({
  onAdd,
  onClose,
  reduceMotion,
}: {
  onAdd: (draft: SourceDraft) => void;
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
      kind,
      title:
        title.trim() ||
        (needsFile
          ? (file?.name ?? "Untitled")
          : `${body.trim().slice(0, 42)}${body.trim().length > 42 ? "…" : ""}`),
      text: needsFile ? "" : body,
      file: needsFile ? file : null,
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
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as SourceKind);
              setFile(null);
            }}
          >
            <option value="text">Pasted text</option>
            <option value="pdf">Document (PDF / TXT / MD)</option>
            <option value="image">Image (this session only)</option>
          </select>
        </label>

        {kind === "image" && (
          <p className="field-hint">
            Images feed the vision model for this session but are not saved — only text
            content persists between sign-ins.
          </p>
        )}

        <label className="field">
          <span className="field-label">Title (optional)</span>
          <input
            type="text"
            value={title}
            placeholder="e.g. Quarterly report summary"
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
