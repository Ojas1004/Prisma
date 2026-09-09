import type { Transform as TransformRow } from "@/lib/types";

export type TurnPhase = "generating" | "done" | "failed";
export type TypeState = "pending" | "running" | "ok" | "err";
export type SourceKind = "text" | "pdf" | "image";

/** One item in the Sources panel. Checked sources feed the next run.
 *
 * Items are persisted per user, so `id` is the database row's uuid once saved
 * and `sizeBytes` is the server-computed size of the stored content — the
 * panel's storage total sums these rather than guessing from a File. */
export interface SourceItem {
  id: string;
  kind: SourceKind;
  title: string;
  text: string;
  file: File | null;
  checked: boolean;
  sizeBytes: number;
}

/** What the add-source modal collects, before it has been persisted. The
 * caller saves it and turns the server's reply into a SourceItem. */
export interface SourceDraft {
  kind: SourceKind;
  title: string;
  text: string;
  file: File | null;
}

/** One submission and its outcome — a user request plus the assistant
 * response that answers it. The console thread is this list, oldest first;
 * turns are only ever appended or updated in place, never replaced. */
export interface Turn {
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

/** One successful artifact surfaced in the Studio output list. */
export interface StudioOutput {
  turnId: string;
  type: string;
  title: string;
  downgradedTo: string;
  chunkedInto: number;
}
