"""TextGenerator — produces text-kind artifacts. One instance per text entry
in prompts.json; the entry's system + instructions define the artifact type."""

from app import llm
from app.generators import GenOutput, Generator, GeneratorError, Kind, Progress, Request, parse_json_object
from app.models import Artifact

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

        parts = [self.cfg.system, self.output_type.system]
        parts.extend(f"- {ins}" for ins in self.output_type.instructions)
        if params := self.parameters_block(req.options):
            parts.append(params)
        parts.append(TEXT_SCHEMA)
        parts.append(self.source_section(req.source))
        prompt = "\n\n".join(p for p in parts if p)

        if req.source.image_bytes is not None:
            messages = [llm.multimodal_message("user", prompt, req.source.image_bytes, req.source.image_mime)]
        else:
            messages = [llm.text_message("user", prompt)]

        raw = await self.client.chat(messages, json_mode=True)
        parsed = parse_json_object(raw)

        body = str(parsed.get("body_markdown", "")).strip()
        if not body:
            raise GeneratorError("model returned an empty artifact body")

        metadata = parsed.get("metadata") or {}
        return GenOutput(
            artifact=Artifact(
                kind=Kind.TEXT.value,
                title=str(parsed.get("title", "")) or self.output_type.label,
                body_markdown=body,
                highlights=[str(h) for h in parsed.get("highlights") or []],
                metadata={str(k): str(v) for k, v in metadata.items()} if isinstance(metadata, dict) else {},
            )
        )
