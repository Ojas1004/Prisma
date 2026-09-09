"""HTTP routes. Every JSON response uses the {success, data, error} envelope."""

import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response, StreamingResponse
# Manual form parsing yields Starlette's UploadFile, NOT FastAPI's subclass —
# an isinstance check against fastapi.UploadFile silently misses real uploads.
from starlette.datastructures import UploadFile

from app import config, db, sources
from app.models import Artifact, Options, RetryBody, SSEEvent, StartBody, UpdateContentBody
from app.sse import hub

router = APIRouter()

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


# ── Envelope helpers ──────────────────────────────────────────────────────────

def ok(data, status_code: int = 200) -> JSONResponse:
    return JSONResponse({"success": True, "data": data}, status_code=status_code)


def error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        {"success": False, "error": {"code": code, "message": message}},
        status_code=status_code,
    )


def _is_terminal(ev: SSEEvent) -> bool:
    """Per-type failures (output_type set) keep the stream open; only a
    job-level failure or the final pipeline-completed event closes it."""
    if ev.status == "failed" and not ev.output_type:
        return True
    return ev.step == "pipeline" and ev.status == "completed"


# ── Registry ──────────────────────────────────────────────────────────────────

@router.get("/", include_in_schema=False)
async def root():
    """This server is API-only (the UI is the Vite frontend on :5173) —
    a bare visit lands on the interactive docs instead of a 404."""
    return RedirectResponse("/docs")


@router.get("/health")
async def health():
    return ok({"status": "ok"})


@router.get("/api/output-types")
async def output_types(request: Request):
    """The frontend's registry: selectable output types plus the parameter
    definitions it renders the generation-parameters form from."""
    cfg = request.app.state.prompts
    return ok({
        "output_types": [
            {"type": t.type, "kind": t.kind, "label": t.label, "description": t.description}
            for t in cfg.types
        ],
        "parameters": [
            {
                "key": p.key,
                "label": p.label,
                "kind": p.kind,
                "placeholder": p.placeholder,
                "options": list(p.options.keys()),
            }
            for p in cfg.parameters
        ],
    })


# ── Start ─────────────────────────────────────────────────────────────────────

@router.post("/api/transform/start")
async def start(request: Request):
    """Accepts JSON (text/prompt sources) or multipart (pdf/image/txt/md file).
    Parsed manually so one endpoint can serve both content types."""
    cfg = request.app.state.prompts
    runner = request.app.state.runner

    source_kind = ""
    source_text = ""
    title = ""
    output_types: list[str] = []
    parsed_options = Options()
    file_payload: bytes | None = None
    file_suffix = ""

    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            body = StartBody(**(await request.json()))
        except Exception as exc:  # noqa: BLE001 — validation surface
            return error(400, "invalid_body", f"invalid request body: {exc}")
        source_kind, source_text, title = body.source_kind, body.text, body.title
        output_types, parsed_options = body.output_types, body.options
    else:
        form = await request.form()
        source_kind = str(form.get("source_kind", ""))
        source_text = str(form.get("text", ""))
        title = str(form.get("title", ""))
        if raw_types := form.get("output_types"):
            try:
                output_types = [str(t) for t in json.loads(str(raw_types))]
            except Exception:  # noqa: BLE001
                return error(400, "invalid_output_types", "output_types must be a JSON array")
        if raw_options := form.get("options"):
            try:
                parsed_options = Options(**json.loads(str(raw_options)))
            except Exception:  # noqa: BLE001
                return error(400, "invalid_options", "options must be a JSON object")
        upload = form.get("file")
        if isinstance(upload, UploadFile):
            file_suffix = Path(upload.filename or "").suffix.lower()
            file_payload = await upload.read()
            if not title:
                title = upload.filename or ""

    # Dedupe preserving selection order, then validate against the registry.
    output_types = list(dict.fromkeys(output_types))
    if not output_types:
        return error(400, "missing_output_types", "select at least one output type")
    unknown = [ot for ot in output_types if cfg.type_by_key(ot) is None]
    if unknown:
        return error(400, "invalid_output_type", f"unknown output types: {unknown!r}")

    if source_kind in ("text", "prompt"):
        if not source_text.strip():
            return error(400, "missing_text", "text is required for text/prompt sources")
        file_payload = None

    elif source_kind in ("pdf", "image"):
        if file_payload is None:
            return error(400, "missing_file", "file is required for pdf/image sources")
        if len(file_payload) == 0:
            return error(400, "empty_file", "uploaded file is empty")
        if len(file_payload) > MAX_UPLOAD_BYTES:
            return error(400, "file_too_large", "file exceeds the 25 MB limit")

        if file_suffix in (".txt", ".md"):
            # Text carried as a file — read it straight into source_text.
            source_kind = "text"
            source_text = file_payload.decode("utf-8", errors="replace")
            file_payload = None
        elif source_kind == "pdf" and file_suffix != ".pdf":
            return error(400, "unsupported_file", "document must be pdf, txt, or md")
        elif source_kind == "image" and file_suffix not in sources.IMAGE_MIMES:
            return error(400, "unsupported_image", "image must be png, jpg, or webp")

    else:
        return error(400, "invalid_source_kind", "source_kind must be text, prompt, pdf, or image")

    transform_id = await db.insert_transform(
        source_kind=source_kind,
        source_title=title,
        source_path="",
        source_text=source_text,
        output_types=output_types,
        options=parsed_options,
        model=runner.model,
    )

    if file_payload is not None:
        uploads_dir = config.DATA_DIR / "uploads"
        uploads_dir.mkdir(parents=True, exist_ok=True)
        dst = uploads_dir / f"{transform_id}{file_suffix}"
        await asyncio.to_thread(dst.write_bytes, file_payload)
        await db.pool().execute(
            "UPDATE transforms SET source_path = $1 WHERE id = $2", str(dst), transform_id
        )

    runner.start(transform_id)

    return ok(
        {
            "id": transform_id,
            "stream_url": f"/api/transform/{transform_id}/stream",
            "status_url": f"/api/transform/{transform_id}",
        },
        status_code=202,
    )


# ── Read ──────────────────────────────────────────────────────────────────────

@router.get("/api/transform/list")
async def list_transforms():
    transforms = await db.list_transforms()
    return ok({"transforms": [t.model_dump(mode="json") for t in transforms]})


@router.get("/api/transform/{transform_id}")
async def get_transform(transform_id: str):
    t = await db.get_transform(transform_id)
    if t is None:
        return error(404, "transform_not_found", "transform not found")
    return ok(t.model_dump(mode="json"))


# ── SSE ───────────────────────────────────────────────────────────────────────

@router.get("/api/transform/{transform_id}/stream")
async def stream(transform_id: str, request: Request):
    t = await db.get_transform(transform_id)
    if t is None:
        return error(404, "transform_not_found", "transform not found")

    async def event_source():
        def frame(ev: SSEEvent) -> str:
            return f"data: {ev.model_dump_json()}\n\n"

        # Terminal rows: replay the outcome and close immediately.
        if t.status == "completed":
            yield frame(SSEEvent(step="pipeline", status="completed", message="Your deliverables are ready"))
            return
        if t.status == "failed":
            yield frame(SSEEvent(step=t.stage or "pipeline", status="failed", message=t.error_message))
            return

        # Subscribe before replaying the current stage so no event is lost.
        queue = hub.subscribe(transform_id)
        try:
            if t.stage and t.stage != "queued":
                # Per-type stages are "<step>:<type>" — carry the type so a
                # reconnecting client can mark that deliverable as running.
                stage_type = t.stage.split(":", 1)[1] if ":" in t.stage else ""
                yield frame(SSEEvent(step=t.stage, status="processing", message="Resuming...", output_type=stage_type))
            while True:
                if await request.is_disconnected():
                    return
                try:
                    ev = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                yield frame(ev)
                if _is_terminal(ev):
                    return
        finally:
            hub.unsubscribe(transform_id, queue)

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Edit / retry / export / delete ────────────────────────────────────────────

@router.put("/api/transform/{transform_id}/content")
async def update_content(transform_id: str, body: UpdateContentBody):
    t = await db.get_transform(transform_id)
    if t is None:
        return error(404, "transform_not_found", "transform not found")
    if t.content is None:
        return error(409, "content_not_ready", "no deliverables generated yet")

    edited = body.content
    existing = t.content.by_type(edited.output_type)
    if existing is None:
        return error(404, "artifact_not_found", f"no artifact for output type {edited.output_type!r}")

    # Server-owned fields — edits can't change them.
    edited.kind = existing.kind
    edited.image_path = existing.image_path
    edited.error = existing.error
    # Provenance of how this deliverable was generated: an edit to the text
    # doesn't change what effort produced it.
    edited.reasoning_requested = existing.reasoning_requested
    edited.reasoning_applied = existing.reasoning_applied
    edited.reasoning_downgrade_reason = existing.reasoning_downgrade_reason
    edited.source_chunks = existing.source_chunks

    t.content.artifacts = [
        edited if a.output_type == edited.output_type else a for a in t.content.artifacts
    ]
    await db.update_bundle(transform_id, t.content)
    return ok(t.model_dump(mode="json"))


@router.post("/api/transform/{transform_id}/retry")
async def retry(transform_id: str, request: Request, body: RetryBody | None = None):
    t = await db.get_transform(transform_id)
    if t is None:
        return error(404, "transform_not_found", "transform not found")
    if t.status == "processing":
        return error(409, "still_processing", "transform is already running")

    retry_types = list(dict.fromkeys(body.output_types)) if body else []
    outside = [ot for ot in retry_types if ot not in t.output_types]
    if outside:
        return error(400, "invalid_output_type", f"not part of this job: {outside!r}")

    await db.reset_for_retry(transform_id)
    request.app.state.runner.start(transform_id, retry_types or None)
    return ok(
        {"id": transform_id, "stream_url": f"/api/transform/{transform_id}/stream"},
        status_code=202,
    )


def _artifact_lines(artifact: Artifact) -> list[str]:
    lines = []
    if artifact.title:
        lines.append(f"# {artifact.title}\n")
    lines.append(artifact.body_markdown)
    if artifact.highlights:
        lines.append("\n## Key Points\n")
        lines.extend(f"- {h}" for h in artifact.highlights)
    return lines


@router.get("/api/transform/{transform_id}/export")
async def export(transform_id: str, format: str = "md", type: str = ""):
    t = await db.get_transform(transform_id)
    if t is None:
        return error(404, "transform_not_found", "transform not found")
    if t.content is None:
        return error(409, "content_not_ready", "no deliverables generated yet")

    if type:
        artifact = t.content.by_type(type)
        if artifact is None or artifact.error:
            return error(404, "artifact_not_found", f"no successful artifact for type {type!r}")
        lines = _artifact_lines(artifact)
        stem = f"{type}"
    else:
        succeeded = [a for a in t.content.artifacts if not a.error]
        if not succeeded:
            return error(409, "content_not_ready", "no successful deliverables to export")
        lines = []
        for i, artifact in enumerate(succeeded):
            if i:
                lines.append("\n\n" + "=" * 40 + "\n\n")
            lines.extend(_artifact_lines(artifact))
        stem = "bundle"

    body = "\n".join(lines)
    if format == "md":
        return Response(
            body,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{stem}.md"'},
        )
    if format == "txt":
        return Response(
            body,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{stem}.txt"'},
        )
    return error(400, "invalid_format", "format must be md or txt")


@router.delete("/api/transform/{transform_id}/artifact/{output_type}")
async def delete_artifact(transform_id: str, output_type: str):
    """Remove one deliverable from a finished bundle (and its selection)."""
    t = await db.get_transform(transform_id)
    if t is None:
        return error(404, "transform_not_found", "transform not found")
    if t.status == "processing":
        return error(409, "still_processing", "transform is still running")
    if t.content is None or t.content.by_type(output_type) is None:
        return error(404, "artifact_not_found", f"no artifact for output type {output_type!r}")
    if len(t.content.artifacts) <= 1:
        return error(409, "last_artifact", "cannot remove the last deliverable — delete the job instead")

    removed = t.content.by_type(output_type)
    t.content.artifacts = [a for a in t.content.artifacts if a.output_type != output_type]
    await db.update_bundle(transform_id, t.content)
    await db.update_output_types(
        transform_id, [ot for ot in t.output_types if ot != output_type]
    )
    if removed and removed.image_path:
        try:
            (config.DATA_DIR / removed.image_path).unlink(missing_ok=True)
        except OSError:
            pass
    t.output_types = [ot for ot in t.output_types if ot != output_type]
    return ok(t.model_dump(mode="json"))


@router.get("/api/transform/{transform_id}/image")
async def image(transform_id: str):
    """Legacy image-flow endpoint — serves the first artifact with a stored
    image. Scheduled for removal with generators/image.py (Task 4)."""
    t = await db.get_transform(transform_id)
    if t is None:
        return error(404, "transform_not_found", "transform not found")
    artifact = next(
        (a for a in (t.content.artifacts if t.content else []) if a.image_path), None
    )
    if artifact is None:
        return error(404, "image_not_found", "no image for this transform")
    path = config.DATA_DIR / artifact.image_path
    if not path.is_file():
        return error(404, "image_not_found", "image file missing")
    media_types = {".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg"}
    return FileResponse(path, media_type=media_types.get(path.suffix.lower(), "application/octet-stream"))


@router.delete("/api/transform/{transform_id}")
async def delete(transform_id: str):
    t = await db.get_transform(transform_id)
    if t is None:
        return error(404, "transform_not_found", "transform not found")

    source_path = await db.get_source_path(transform_id)
    await db.delete_transform(transform_id)

    # Best-effort file cleanup.
    paths = [Path(source_path)] if source_path else []
    if t.content:
        paths.extend(
            config.DATA_DIR / a.image_path for a in t.content.artifacts if a.image_path
        )
    for p in paths:
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass
    return ok({"deleted": True})
