import type { ApiEnvelope, Options, OutputTypeInfo, ParameterInfo, SSEEvent, StartResponse, Transform } from "./types";

export const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const envelope: ApiEnvelope<T> = await res.json();
  if (!envelope.success || envelope.data === undefined) {
    throw new Error(envelope.error?.message ?? `Request failed: ${path} (${res.status})`);
  }
  return envelope.data;
}

export function getOutputTypes(): Promise<{ output_types: OutputTypeInfo[]; parameters: ParameterInfo[] }> {
  return request("/api/output-types");
}

export interface StartParams {
  source_kind: "text" | "prompt" | "pdf" | "image";
  text?: string;
  title?: string;
  output_types: string[];
  options?: Options;
  file?: File | null;
}

export function startTransform(params: StartParams): Promise<StartResponse> {
  if (params.file) {
    const form = new FormData();
    form.set("source_kind", params.source_kind);
    form.set("output_types", JSON.stringify(params.output_types));
    if (params.text) form.set("text", params.text);
    if (params.title) form.set("title", params.title);
    if (params.options) form.set("options", JSON.stringify(params.options));
    form.set("file", params.file);
    return request("/api/transform/start", { method: "POST", body: form });
  }
  return request("/api/transform/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_kind: params.source_kind,
      text: params.text ?? "",
      title: params.title ?? "",
      output_types: params.output_types,
      options: params.options ?? {},
    }),
  });
}

export function getTransform(id: string): Promise<Transform> {
  return request(`/api/transform/${id}`);
}

/** Empty outputTypes = backend re-runs failed/missing types (or all, if the
 * whole bundle succeeded). A subset re-runs exactly those types. */
export function retryTransform(id: string, outputTypes: string[] = []): Promise<StartResponse> {
  return request(`/api/transform/${id}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ output_types: outputTypes }),
  });
}

export function deleteTransform(id: string): Promise<{ deleted: boolean }> {
  return request(`/api/transform/${id}`, { method: "DELETE" });
}

export function deleteArtifact(id: string, outputType: string): Promise<Transform> {
  return request(`/api/transform/${id}/artifact/${outputType}`, { method: "DELETE" });
}

export function exportUrl(id: string, format: "md" | "txt", outputType = ""): string {
  const type = outputType ? `&type=${encodeURIComponent(outputType)}` : "";
  return `${BASE_URL}/api/transform/${id}/export?format=${format}${type}`;
}

// The stream needs no auth, so native EventSource is enough.
export function connectStream(
  id: string,
  onEvent: (ev: SSEEvent) => void,
  onError: () => void,
): () => void {
  const source = new EventSource(`${BASE_URL}/api/transform/${id}/stream`);
  source.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as SSEEvent);
    } catch {
      // ignore malformed frames (keepalives arrive as comments, not messages)
    }
  };
  source.onerror = () => {
    // Fires both on real errors and on server-side stream close; the caller
    // decides what to do based on the events it has already seen.
    source.close();
    onError();
  };
  return () => source.close();
}
