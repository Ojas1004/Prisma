// API contracts — snake_case mirror of backend/app/models.py.

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface OutputTypeInfo {
  type: string;
  kind: "text" | "image";
  label: string;
  description: string;
}

// One generation-parameter definition from GET /api/output-types — the form
// renders "text" kinds as free inputs and "select" kinds as dropdowns.
export interface ParameterInfo {
  key: string;
  label: string;
  kind: "text" | "select";
  placeholder: string;
  options: string[];
}

export interface Options {
  target_audience?: string;
  tone?: string;
  language?: string;
  level_of_detail?: string;
  communication_objective?: string;
  content_style?: string;
  /** Groq API parameter (not a prompt parameter) — how hard the model thinks
   * before writing. Groq documents low|medium|high for gpt-oss-120b. */
  reasoning_effort?: string;
}

// One deliverable inside a bundle. A failed type has `error` set and an
// empty body — the rest of the bundle still completes.
export interface Artifact {
  output_type: string;
  title: string;
  body_markdown: string;
  highlights: string[];
  metadata: Record<string, string>;
  error: string;
  kind: string;
  image_path: string;
  image_prompt: string;
  /** How this deliverable was actually generated. `requested` and `applied`
   * differ only when the effort ladder downgraded mid-flight under
   * token-budget pressure; otherwise the reason is empty. */
  reasoning_requested?: string;
  reasoning_applied?: string;
  reasoning_downgrade_reason?: string;
  /** Chunks the source was split into; 0/absent when it fit one pass. */
  source_chunks?: number;
}

export interface Bundle {
  artifacts: Artifact[];
}

export interface Transform {
  id: string;
  source_kind: string;
  source_title: string;
  source_text: string;
  output_types: string[];
  options: Options;
  content: Bundle | null;
  status: "processing" | "completed" | "failed";
  stage: string;
  error_message: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface StartResponse {
  id: string;
  stream_url: string;
  status_url: string;
}

// output_type is set on per-type events; a "failed" event is terminal for
// the job only when output_type is empty.
export interface SSEEvent {
  step: string;
  status: "processing" | "completed" | "failed";
  message: string;
  output_type?: string;
}
