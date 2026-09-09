"""Pydantic models — the API contract mirrored by the frontend's types.ts."""

from datetime import datetime

from pydantic import BaseModel, Field


class Options(BaseModel):
    """The 6 operator-tunable generation parameters. Keys match the
    "parameters" entries in prompts.json — the generator resolves each value
    against its definition there (select → hint text, text → prompt_template)."""

    target_audience: str = ""
    tone: str = ""  # formal | neutral | urgent | conversational
    language: str = ""
    level_of_detail: str = ""  # brief | standard | comprehensive
    communication_objective: str = ""
    content_style: str = ""  # factual | analytical | narrative | persuasive

    # NOT a prompt parameter — this one is passed to the Groq API itself as
    # `reasoning_effort`, so it is deliberately excluded from
    # Generator.parameters_block(). Groq documents low|medium|high for
    # gpt-oss-120b; empty means "use the server default in config".
    reasoning_effort: str = ""


class Artifact(BaseModel):
    """One generated deliverable inside a bundle, self-identified by
    output_type. A failed type carries its error here (empty body) so the
    rest of the bundle still completes."""

    output_type: str = ""
    title: str = ""
    body_markdown: str = ""
    highlights: list[str] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)
    error: str = ""  # per-type failure; empty = success
    # Which reasoning effort this deliverable actually ran at. These differ
    # only when the ladder downgraded mid-flight under token-budget pressure;
    # the frontend shows an indicator when they do.
    reasoning_requested: str = ""
    reasoning_applied: str = ""
    reasoning_downgrade_reason: str = ""
    # How many chunks the source document was split into for this job. 0 =
    # the source fit in one pass and no chunking happened. Every deliverable
    # in a multi-select run carries the same value — they share one digest.
    source_chunks: int = 0
    # Legacy image-flow fields — removal is Task 4 (with generators/image.py).
    kind: str = "text"
    image_path: str = ""
    image_prompt: str = ""


class Bundle(BaseModel):
    """content JSONB: every deliverable of one job, in selection order."""

    artifacts: list[Artifact] = Field(default_factory=list)

    def by_type(self, output_type: str) -> Artifact | None:
        return next((a for a in self.artifacts if a.output_type == output_type), None)


class Transform(BaseModel):
    """Full row state surfaced over the API."""

    id: str
    source_kind: str  # text | prompt | pdf | image
    source_title: str = ""
    source_text: str = ""
    output_types: list[str]
    options: Options = Field(default_factory=Options)
    content: Bundle | None = None
    status: str  # processing | completed | failed
    stage: str = ""
    error_message: str = ""
    model: str = ""
    created_at: datetime
    updated_at: datetime


class SSEEvent(BaseModel):
    """One progress message on a transform's stream. output_type is set on
    per-type events — a "failed" event is terminal for the job only when
    output_type is empty (job-level failure)."""

    step: str
    status: str  # processing | completed | failed
    message: str = ""
    output_type: str = ""


class StartBody(BaseModel):
    """JSON body for text/prompt sources (files come as multipart instead)."""

    source_kind: str
    text: str = ""
    title: str = ""
    output_types: list[str] = Field(default_factory=list)
    options: Options = Field(default_factory=Options)


class UpdateContentBody(BaseModel):
    """Operator edit of one artifact — matched by content.output_type."""

    content: Artifact


class RetryBody(BaseModel):
    """Optional subset of types to re-run. Empty = failed/missing types only
    (or everything, when the whole bundle already succeeded)."""

    output_types: list[str] = Field(default_factory=list)


class SavedSource(BaseModel):
    """One persisted item from the Sources panel. Scoped to a user in the
    database; user_id is never returned — the caller only ever sees their own."""

    id: str
    title: str
    source_type: str
    content_text: str
    size_bytes: int
    created_at: datetime


class CreateSourceBody(BaseModel):
    """JSON body for a pasted-text source. Documents come as multipart to
    /api/sources/upload instead, so their text is extracted server-side.
    size_bytes is deliberately absent — the server computes it."""

    title: str = ""
    source_type: str = "text"
    content_text: str
