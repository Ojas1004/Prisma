"""Source resolution — normalizes every source_kind into what generators
consume. A future URL/video resolver only has to produce ResolvedSource."""

from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

from app import chunking, config

IMAGE_MIMES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


@dataclass
class ResolvedSource:
    text: str = ""
    image_bytes: bytes | None = None
    image_mime: str = ""
    is_prompt: bool = False  # free-form operator brief rather than source material
    truncated_from: int = 0  # original char count when the source was trimmed
    # Chunking plan for oversized sources. Built once here at ingestion so a
    # multi-select job maps the document a single time; the runner turns it
    # into a digest before the per-deliverable loop.
    chunk_plan: "chunking.ChunkPlan | None" = None


class SourceError(Exception):
    pass


def _resolve_document(text: str) -> ResolvedSource:
    """Size a text document against the token budget.

    Chunking is the primary path for large documents: plan_chunks decides
    whether the source fits one call or needs splitting, and raises loudly
    when it fits neither (requirement 6 — never silently truncate). The plan
    is built HERE, once per source, so a multi-select job does not re-chunk
    per deliverable.
    """
    plan = chunking.plan_chunks(text)
    if not plan.chunked:
        return ResolvedSource(text=text)
    return ResolvedSource(text=text, chunk_plan=plan)


def truncate_source(text: str) -> tuple[str, int]:
    """Legacy hard trim. No longer on the document path — chunking replaced
    it — and kept only as a backstop for callers that need a bounded string.
    Cuts on a paragraph break where possible and says so inline."""
    limit = config.MAX_SOURCE_CHARS
    if len(text) <= limit:
        return text, 0

    head = text[:limit]
    # Prefer a paragraph break in the last 20% of the budget, else a sentence end.
    window = head[int(limit * 0.8):]
    for sep in ("\n\n", ". "):
        idx = window.rfind(sep)
        if idx != -1:
            head = head[: int(limit * 0.8) + idx + len(sep)]
            break

    return (
        head.rstrip()
        + f"\n\n[SOURCE TRUNCATED — {len(text):,} characters supplied, first "
        f"{len(head):,} used. Base the deliverable only on the text above.]",
        len(text),
    )


def resolve(source_kind: str, source_text: str, source_path: str) -> ResolvedSource:
    if source_kind == "text":
        return _resolve_document(source_text)

    if source_kind == "prompt":
        # A brief is the instruction itself — trimming it would change the task.
        return ResolvedSource(text=source_text, is_prompt=True)

    if source_kind == "pdf":
        text = extract_pdf_text(Path(source_path))
        if not text.strip():
            raise SourceError("no extractable text in PDF (scanned documents are not supported yet)")
        return _resolve_document(text)

    if source_kind == "image":
        path = Path(source_path)
        mime = IMAGE_MIMES.get(path.suffix.lower(), "image/png")
        return ResolvedSource(text=source_text, image_bytes=path.read_bytes(), image_mime=mime)

    raise SourceError(f"unknown source_kind {source_kind!r}")


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)
