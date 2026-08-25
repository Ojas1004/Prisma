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


class Artifact(BaseModel):
    """Kind-discriminated generation result. `kind` tells the frontend how to
    render it; future kinds (video) extend this additively."""

    kind: str  # "text" | "image"
    title: str = ""
    body_markdown: str = ""  # text kinds (caption for image kinds)
    highlights: list[str] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)
    image_path: str = ""  # image kinds, relative to DATA_DIR
    image_prompt: str = ""  # editable, drives regeneration


class Transform(BaseModel):
    """Full row state surfaced over the API."""

    id: str
    source_kind: str  # text | prompt | pdf | image
    source_title: str = ""
    source_text: str = ""
    output_type: str
    output_kind: str  # text | image
    options: Options = Field(default_factory=Options)
    content: Artifact | None = None
    status: str  # processing | completed | failed
    stage: str = ""
    error_message: str = ""
    model: str = ""
    created_at: datetime
    updated_at: datetime


class SSEEvent(BaseModel):
    """One progress message on a transform's stream."""

    step: str
    status: str  # processing | completed | failed
    message: str = ""


class StartBody(BaseModel):
    """JSON body for text/prompt sources (files come as multipart instead)."""

    source_kind: str
    text: str = ""
    title: str = ""
    output_type: str
    options: Options = Field(default_factory=Options)


class UpdateContentBody(BaseModel):
    content: Artifact


class RetryBody(BaseModel):
    image_prompt: str = ""
