"""Batched generation — every selected deliverable in ONE API call.

Why this exists: the per-type loop in runner.py fires one request per output
type, so a 7-type job is 7 requests that each resend the same source material.
Measured 11-12 Sep 2026, that is the dominant cost on both providers:

  * Gemini free tier caps GenerateRequestsPerDayPerProjectPerModel at 20 per
    day. One 7-type job spent a third of the daily budget; batching makes it
    one request, so the same quota serves ~20 jobs instead of ~3.
  * Groq's cap is 8,000 tokens per minute and prompt + completion share it.
    Seven calls each re-paying the source prompt drains the window repeatedly;
    one call pays it once. Measured for 7 types: ~1,739 prompt + ~4,900
    completion = ~6,639 tokens, which fits one window.

The batched response is parsed into one Artifact per type, so the runner and
the frontend see exactly what the per-type path produced.

FALLBACK IS NOT OPTIONAL. One big completion is likelier to hit
finish_reason="length" than several small ones, and on the batched path that
single failure would take down every deliverable at once instead of one. So
runner.py keeps the per-type loop and falls back to it whenever the batched
call fails or returns an incomplete set — batching is an optimization, never
the only way to get output.
"""

import json
import logging

from app import llm, timing
from app.config import OutputType, PromptConfig
from app.generators import (
    GeneratorError,
    Kind,
    Options,
    Request,
    parse_json_object,
)
from app.models import Artifact

log = logging.getLogger("generators")

# Per-deliverable shape — identical to TEXT_SCHEMA's contract in text.py, so a
# batched artifact is indistinguishable from a singly-generated one.
_PER_TYPE_SHAPE = """{
    "title": "artifact headline",
    "body_markdown": "the full artifact in Markdown",
    "highlights": ["3-6 short key points, quotes, or platform variants"],
    "metadata": {"key": "value pairs specific to this artifact type"}
  }"""


def batch_schema(types: list[OutputType]) -> str:
    """The JSON contract for a batched call: one key per requested type."""
    keys = ",\n  ".join(f'"{t.type}": {_PER_TYPE_SHAPE}' for t in types)
    return (
        "Respond with ONLY a JSON object containing EXACTLY these "
        f"{len(types)} top-level keys, one per deliverable:\n{{\n  {keys}\n}}\n\n"
        "Every key is required. Do not add keys, omit keys, rename keys, or "
        "nest the whole object inside another wrapper."
    )


def build_batch_prompt(cfg: PromptConfig, types: list[OutputType], req: Request) -> str:
    """One prompt covering every requested deliverable.

    Ordering mirrors text.py: the invariant part (global system, then the
    source) comes first so a repeated prefix stays cacheable, and the
    per-deliverable briefs follow. Each type keeps its own system line and
    instructions verbatim, so batching does not dilute the type-specific
    guidance that makes an advisory read like an advisory.
    """
    parts = [cfg.system, _source_section(req)]

    parts.append(
        f"You will produce {len(types)} SEPARATE deliverables from the source "
        "material above, in one response. Each is an independent artifact with "
        "its own audience and format — write each one fully, as though it were "
        "the only thing you had been asked for. Do not cross-reference them, "
        "do not summarize one inside another, and do not let one deliverable's "
        "format bleed into another's."
    )

    for i, t in enumerate(types, 1):
        brief = [f"── DELIVERABLE {i} of {len(types)} — key \"{t.type}\" ({t.label}) ──"]
        if t.system:
            brief.append(t.system)
        brief.extend(f"- {ins}" for ins in t.instructions)
        parts.append("\n".join(brief))

    if params := _parameters_block(cfg, req.options):
        parts.append(params)
    parts.append(batch_schema(types))
    return "\n\n".join(p for p in parts if p)


def _source_section(req: Request) -> str:
    """Same framing as Generator.source_section (reused via a free function so
    this module does not need a Generator instance)."""
    src = req.source
    if src.image_bytes is not None:
        if src.text.strip():
            return f"SOURCE MATERIAL: the attached image, with this operator note:\n{src.text}"
        return "SOURCE MATERIAL: the attached image. Read every visible detail from it."
    if src.is_prompt:
        return (
            "OPERATOR BRIEF (there is no other source material — produce the "
            f"artifacts this brief asks for):\n{src.text}"
        )
    return f"SOURCE MATERIAL:\n<<<\n{src.text}\n>>>"


def _parameters_block(cfg: PromptConfig, opts: Options) -> str:
    """Operator parameters apply to every deliverable in the batch."""
    lines: list[str] = []
    for param in cfg.parameters:
        value = str(getattr(opts, param.key, "") or "").strip()
        if not value:
            continue
        if param.kind == "select":
            lines.append(f"{param.label}: {param.options.get(value) or value}")
        elif param.prompt_template:
            lines.append(param.prompt_template.format(value=value))
        else:
            lines.append(f"{param.label}: {value}")
    if not lines:
        return ""
    return (
        "GENERATION PARAMETERS (apply to ALL deliverables below):\n"
        + "\n".join(f"- {line}" for line in lines)
    )


def _artifact_from(entry: dict, ot: str, label: str, result: llm.ChatResult) -> Artifact:
    """Build one Artifact from the batched response's entry for `ot`."""
    if not isinstance(entry, dict):
        raise GeneratorError(f"{ot}: expected a JSON object, got {type(entry).__name__}")
    body = str(entry.get("body_markdown", "")).strip()
    if not body:
        raise GeneratorError(f"{ot}: model returned an empty artifact body")
    metadata = entry.get("metadata") or {}
    return Artifact(
        output_type=ot,
        kind=Kind.TEXT.value,
        title=str(entry.get("title", "")) or label,
        body_markdown=body,
        highlights=[str(h) for h in entry.get("highlights") or []],
        metadata={str(k): str(v) for k, v in metadata.items()} if isinstance(metadata, dict) else {},
        reasoning_requested=result.requested,
        reasoning_applied=result.applied,
        reasoning_downgrade_reason=result.downgrade_reason,
    )


async def generate_batch(
    client,
    cfg: PromptConfig,
    types: list[OutputType],
    req: Request,
) -> dict[str, Artifact]:
    """Generate every type in `types` with ONE API call.

    Returns {output_type: Artifact} for every requested type. Raises
    GeneratorError if the call fails or the response is missing any requested
    key — the caller falls back to per-type generation rather than shipping a
    partial bundle.
    """
    async with timing.step("prompt_construction:batch", f"{len(types)} types"):
        prompt = build_batch_prompt(cfg, types, req)
        if req.source.image_bytes is not None:
            messages = [
                llm.multimodal_message(
                    "user", prompt, req.source.image_bytes, req.source.image_mime
                )
            ]
        else:
            messages = [llm.text_message("user", prompt)]
        timing.annotate(f"{len(prompt):,} prompt chars")

    # A batched completion carries N deliverables, so it needs N times the
    # room. Left at the provider default the response truncates mid-document
    # and the whole batch is lost.
    async with timing.step("api_call:batch", f"model={client.chat_model}"):
        result = await client.chat(
            messages,
            json_mode=True,
            reasoning_effort=req.options.reasoning_effort,
            max_tokens=_batch_max_tokens(len(types)),
            label=f"batch {len(types)} types",
        )
        timing.annotate(f"{len(result.text):,} response chars")

    async with timing.step("response_parsing:batch"):
        parsed = parse_json_object(result.text)
        # Some models wrap the object one level deeper despite the instruction.
        if len(parsed) == 1 and isinstance(next(iter(parsed.values())), dict):
            only = next(iter(parsed.values()))
            if any(t.type in only for t in types):
                parsed = only

        artifacts: dict[str, Artifact] = {}
        missing: list[str] = []
        for t in types:
            if t.type not in parsed:
                missing.append(t.type)
                continue
            artifacts[t.type] = _artifact_from(parsed[t.type], t.type, t.label, result)
        if missing:
            raise GeneratorError(
                f"batched response missing {len(missing)} of {len(types)} "
                f"requested deliverables: {', '.join(missing)} "
                f"(got keys: {', '.join(sorted(parsed)) or 'none'})"
            )
        timing.annotate(f"{len(artifacts)} artifacts parsed")
    return artifacts


def _batch_max_tokens(n_types: int) -> int:
    """Completion reservation for a batched call.

    Measured ~700 completion tokens per deliverable (2,800 response chars), so
    reserve that per type plus headroom, clamped to the provider ceiling. On
    Groq the ceiling is the 8,000 TPM window itself and llm._post halves the
    reservation on a 413, so asking for more than fits degrades gracefully
    rather than failing.
    """
    from app import config

    per_type = 1_100  # ~700 observed + headroom for a long deliverable
    ceiling = (
        config.GEMINI_MAX_TOKENS
        if config.LLM_PROVIDER == "gemini"
        else config.GROQ_MAX_TOKENS
    )
    return min(max(per_type * n_types, 2_000), ceiling)
