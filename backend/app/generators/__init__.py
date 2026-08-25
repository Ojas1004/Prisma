"""The pluggable output-transformation pipeline.

Every output type is served by a Generator registered in the registry; the job
runner is completely agnostic to what a generator produces. Adding a video
output type later = one new Generator subclass (kind=Kind.VIDEO) + a
prompts.json entry — no changes to the runner, routes, DB, or SSE.
"""

import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Awaitable, Callable

from app.config import OutputType, PromptConfig
from app.llm import GroqClient
from app.models import Artifact, Options
from app.sources import ResolvedSource


class Kind(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    # VIDEO = "video"   # future


@dataclass
class Request:
    """Everything a generator needs to produce an artifact."""

    source: ResolvedSource
    options: Options = field(default_factory=Options)
    # Skips prompt crafting on image regeneration when the operator edited the
    # prompt by hand. Ignored by text generators.
    image_prompt_override: str = ""


# progress(step, message) — generators report sub-stages to the SSE stream.
Progress = Callable[[str, str], Awaitable[None]]


class GeneratorError(Exception):
    pass


@dataclass
class GenOutput:
    """A generator's result: the artifact plus any binary payloads the runner
    should persist. `files` maps an Artifact path field to (bytes, extension) —
    the runner writes each under data/artifacts/ and sets that field to the
    stored relative path. A future video generator adds
    files["video_path"] = (bytes, ".mp4") and nothing else changes."""

    artifact: Artifact
    files: dict[str, tuple[bytes, str]] = field(default_factory=dict)


class Generator(ABC):
    kind: Kind

    def __init__(self, cfg: PromptConfig, output_type: OutputType, client: GroqClient) -> None:
        self.cfg = cfg
        self.output_type = output_type
        self.client = client

    @property
    def type(self) -> str:
        return self.output_type.type

    @abstractmethod
    async def generate(self, req: Request, progress: Progress) -> GenOutput: ...

    # ── Shared prompt building ────────────────────────────────────────────

    def parameters_block(self, opts: Options) -> str:
        """Render the operator's parameter values into a GENERATION PARAMETERS
        prompt block, resolving each against its prompts.json definition:
        select params map the chosen key to its hint text, text params fill
        {value} into their prompt_template. Empty params are omitted."""
        lines: list[str] = []
        for param in self.cfg.parameters:
            value = str(getattr(opts, param.key, "") or "").strip()
            if not value:
                continue
            if param.kind == "select":
                # Unknown keys (not in prompts.json) pass through verbatim
                # rather than being dropped silently.
                lines.append(f"{param.label}: {param.options.get(value) or value}")
            elif param.prompt_template:
                lines.append(param.prompt_template.format(value=value))
            else:
                lines.append(f"{param.label}: {value}")
        if not lines:
            return ""
        return "GENERATION PARAMETERS:\n" + "\n".join(f"- {line}" for line in lines)

    @staticmethod
    def source_section(src: ResolvedSource) -> str:
        """Frame the source material for the prompt."""
        if src.image_bytes is not None:
            if src.text.strip():
                return f"SOURCE MATERIAL: the attached image, with this operator note:\n{src.text}"
            return "SOURCE MATERIAL: the attached image. Read every visible detail from it."
        if src.is_prompt:
            return (
                "OPERATOR BRIEF (there is no other source material — produce the "
                f"artifact this brief asks for):\n{src.text}"
            )
        return f"SOURCE MATERIAL:\n<<<\n{src.text}\n>>>"


def parse_json_object(raw: str) -> dict:
    """Parse a model response into a JSON object, tolerating code fences and
    leading prose."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw).strip()
    if not raw.startswith("{"):
        idx = raw.find("{")
        if idx >= 0:
            raw = raw[idx:]
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise GeneratorError(f"model returned invalid JSON: {exc} — first 200 chars: {raw[:200]}") from exc
    if not isinstance(parsed, dict):
        raise GeneratorError("model returned JSON that is not an object")
    return parsed


def build_registry(cfg: PromptConfig, client: GroqClient) -> dict[str, Generator]:
    """Construct one generator per prompts.json entry, keyed by output type."""
    from app.generators.image import ImageGenerator
    from app.generators.text import TextGenerator

    implementations: dict[Kind, type[Generator]] = {
        Kind.TEXT: TextGenerator,
        Kind.IMAGE: ImageGenerator,
    }
    registry: dict[str, Generator] = {}
    for entry in cfg.types:
        try:
            kind = Kind(entry.kind)
        except ValueError as exc:
            raise ValueError(f"output type {entry.type!r} has unsupported kind {entry.kind!r}") from exc
        registry[entry.type] = implementations[kind](cfg, entry, client)
    return registry
