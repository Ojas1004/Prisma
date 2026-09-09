"""Per-user saved sources — the left Sources panel's persistence.

Every route here depends on `get_current_user_id` (the same Supabase token
verification the account routes use), so none is reachable without a valid
session, and every query is scoped to the returned uuid.

Two create paths, because the console has two real ingestion shapes:
  POST /api/sources         pasted text — the client already has the content
  POST /api/sources/upload  a document — the browser holds only a File, so the
                            text is extracted server-side with the same pypdf
                            helper the transform pipeline uses. Without this,
                            a saved PDF would persist an empty body and the
                            "survives without re-upload" promise would be false.
"""

from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile

from app import config, db, sources
from app.auth import get_current_user_id
from app.models import CreateSourceBody, SavedSource
from app.routes import MAX_UPLOAD_BYTES, error, ok

router = APIRouter(prefix="/api/sources", tags=["sources"])

# The console's real source kinds (frontend `SourceKind`). The landing page's
# marketing chips (ARTICLES / REPORTS / …) are decorative and deliberately not
# accepted here — stored rows describe what was actually ingested.
VALID_SOURCE_TYPES = {"text", "pdf", "image"}

# A stored source is read back into a prompt, so cap it at the same ceiling the
# upload path already enforces rather than letting an arbitrary body through.
MAX_CONTENT_CHARS = 400_000


def _payload(source: SavedSource) -> dict:
    data = source.model_dump()
    data["created_at"] = source.created_at.isoformat()
    return data


@router.get("")
async def list_sources(user_id: str = Depends(get_current_user_id)) -> JSONResponse:
    items = await db.list_sources(user_id)
    return ok({"sources": [_payload(s) for s in items]})


@router.post("")
async def create_source(
    body: CreateSourceBody, user_id: str = Depends(get_current_user_id)
) -> JSONResponse:
    content = body.content_text
    if not content.strip():
        return error(400, "empty_source", "content_text is required")
    if len(content) > MAX_CONTENT_CHARS:
        return error(413, "source_too_large", "Source content exceeds the size limit")
    if body.source_type not in VALID_SOURCE_TYPES:
        return error(400, "bad_source_type", f"source_type must be one of {sorted(VALID_SOURCE_TYPES)}")

    title = body.title.strip() or _title_from_text(content)
    saved = await db.insert_source(user_id, title, body.source_type, content)
    return ok({"source": _payload(saved)}, status_code=201)


@router.post("/upload")
async def upload_source(
    request: Request, user_id: str = Depends(get_current_user_id)
) -> JSONResponse:
    """Persist a document by extracting its text server-side.

    Images are not stored as sources: their content only exists as pixels for
    the vision model at run time, so there is no text to survive a re-login.
    """
    form = await request.form()
    upload = form.get("file")
    if not isinstance(upload, UploadFile):
        return error(400, "missing_file", "A file is required")

    raw = await upload.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        return error(413, "file_too_large", "File exceeds the upload limit")

    suffix = Path(upload.filename or "").suffix.lower()
    if suffix == ".pdf":
        tmp = config.DATA_DIR / "uploads" / f"srcprobe-{user_id}{suffix}"
        tmp.write_bytes(raw)
        try:
            content = sources.extract_pdf_text(tmp)
        except Exception:
            return error(400, "unreadable_pdf", "Could not read text from that PDF")
        finally:
            tmp.unlink(missing_ok=True)
        if not content.strip():
            return error(
                400,
                "no_text_layer",
                "No extractable text in that PDF (scanned documents are not supported yet)",
            )
    elif suffix in (".txt", ".md"):
        try:
            content = raw.decode("utf-8")
        except UnicodeDecodeError:
            return error(400, "bad_encoding", "File must be UTF-8 text")
    else:
        return error(400, "unsupported_type", "Only PDF, TXT and MD files can be saved as sources")

    content = content[:MAX_CONTENT_CHARS]
    title = str(form.get("title") or "").strip() or upload.filename or "Untitled"
    saved = await db.insert_source(user_id, title, "pdf", content)
    return ok({"source": _payload(saved)}, status_code=201)


@router.delete("/{source_id}")
async def delete_source(
    source_id: str, user_id: str = Depends(get_current_user_id)
) -> JSONResponse:
    """404 rather than 403 when the row belongs to someone else: a 403 would
    confirm that another user's source id exists."""
    deleted = await db.delete_source(source_id, user_id)
    if not deleted:
        return error(404, "not_found", "Source not found")
    return ok({"deleted": source_id})


def _title_from_text(content: str) -> str:
    head = content.strip().splitlines()[0] if content.strip() else "Untitled"
    return head[:60] + ("…" if len(head) > 60 else "")
