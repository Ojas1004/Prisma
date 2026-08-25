"""Source resolution — normalizes every source_kind into what generators
consume. A future URL/video resolver only has to produce ResolvedSource."""

from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

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


class SourceError(Exception):
    pass


def resolve(source_kind: str, source_text: str, source_path: str) -> ResolvedSource:
    if source_kind == "text":
        return ResolvedSource(text=source_text)

    if source_kind == "prompt":
        return ResolvedSource(text=source_text, is_prompt=True)

    if source_kind == "pdf":
        text = extract_pdf_text(Path(source_path))
        if not text.strip():
            raise SourceError("no extractable text in PDF (scanned documents are not supported yet)")
        return ResolvedSource(text=text)

    if source_kind == "image":
        path = Path(source_path)
        mime = IMAGE_MIMES.get(path.suffix.lower(), "image/png")
        return ResolvedSource(text=source_text, image_bytes=path.read_bytes(), image_mime=mime)

    raise SourceError(f"unknown source_kind {source_kind!r}")


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)
