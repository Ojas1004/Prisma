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
}

export interface Artifact {
  kind: "text" | "image";
  title: string;
  body_markdown: string;
  highlights: string[];
  metadata: Record<string, string>;
  image_path: string;
  image_prompt: string;
}

export interface Transform {
  id: string;
  source_kind: string;
  source_title: string;
  source_text: string;
  output_type: string;
  output_kind: string;
  options: Options;
  content: Artifact | null;
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

export interface SSEEvent {
  step: string;
  status: "processing" | "completed" | "failed";
  message: string;
}
