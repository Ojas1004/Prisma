"""TextGenerator — produces text-kind artifacts. One instance per text entry
in prompts.json; the entry's system + instructions define the artifact type."""

import logging

from app import llm, timing
from app.generators import GenOutput, Generator, GeneratorError, Kind, Progress, Request, parse_json_object
from app.models import Artifact

log = logging.getLogger("generators")

# Appended to every text prompt so the model returns the Artifact contract.
TEXT_SCHEMA = """Respond with ONLY a JSON object of this exact shape:
{
  "title": "artifact headline",
  "body_markdown": "the full artifact in Markdown",
  "highlights": ["3-6 short key points, quotes, or platform variants"],
  "metadata": {"key": "value pairs specific to this artifact type"}
}"""


class TextGenerator(Generator):
    kind = Kind.TEXT

    async def generate(self, req: Request, progress: Progress) -> GenOutput:
        await progress("generating", f"Generating {self.output_type.label}...")

        async with timing.step("prompt_construction"):
            # ORDER MATTERS — do not move the source section back down.
            #
            # A multi-select job sends one prompt per deliverable, and every
            # one of them carries the SAME source material: on the Attention
            # paper that is 8,718 tokens resent per type (61k input tokens
            # across all 7). Gemini applies implicit context caching to a
            # repeated prompt PREFIX, so putting the invariant part — global
            # system instructions, then the source — first makes everything
            # up to the type-specific block a cache hit for the second and
            # later deliverables in the job. Only the short tail (this type's
            # system line, its instructions, the operator parameters and the
            # response schema) differs.
            #
            # With the source last, as it was, the shared prefix was just
            # cfg.system and each call re-read the whole document at full
            # price — which on the free tier means each call also consumes a
            # full RPM slot's worth of tokens and the next one gets 429'd into
            # a ~30s backoff. Measured: 134.8s for the second deliverable, of
            # which ~132s was sleeping in rate-limit backoff.
            parts = [self.cfg.system, self.source_section(req.source)]
            parts.append(self.output_type.system)
            parts.extend(f"- {ins}" for ins in self.output_type.instructions)
            if params := self.parameters_block(req.options):
                parts.append(params)
            parts.append(TEXT_SCHEMA)
            prompt = "\n\n".join(p for p in parts if p)

            if req.source.image_bytes is not None:
                messages = [llm.multimodal_message("user", prompt, req.source.image_bytes, req.source.image_mime)]
            else:
                messages = [llm.text_message("user", prompt)]
            timing.annotate(f"{len(prompt):,} prompt chars")

        # reasoning_effort is an API parameter, not a prompt parameter — it
        # bypasses parameters_block() and goes straight to the Groq payload.
        async with timing.step(
            "api_call:text", f"model={self.client.chat_model}"
        ):
            result = await self.client.chat(
                messages, json_mode=True, reasoning_effort=req.options.reasoning_effort,
                label=f"deliverable {self.output_type.type}",
            )
            timing.annotate(f"{len(result.text):,} response chars")

        async with timing.step("response_parsing"):
            parsed = parse_json_object(result.text)

        body = str(parsed.get("body_markdown", "")).strip()
        if not body:
            raise GeneratorError("model returned an empty artifact body")

        metadata = parsed.get("metadata") or {}
        if result.downgraded:
            # Structured, per-deliverable: a multi-select run can downgrade
            # some types and not others.
            log.warning(
                "[generation][effort-downgrade] output_type=%s requested=%s applied=%s reason=%s",
                self.output_type.type, result.requested, result.applied, result.downgrade_reason,
            )
        return GenOutput(
            artifact=Artifact(
                kind=Kind.TEXT.value,
                title=str(parsed.get("title", "")) or self.output_type.label,
                body_markdown=body,
                highlights=[str(h) for h in parsed.get("highlights") or []],
                metadata={str(k): str(v) for k, v in metadata.items()} if isinstance(metadata, dict) else {},
                reasoning_requested=result.requested,
                reasoning_applied=result.applied,
                reasoning_downgrade_reason=result.downgrade_reason,
            )
        )
