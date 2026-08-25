"""ImageGenerator — two-stage image artifacts.

Stage 1: the chat model acts as art director and produces a visual spec from
the source. Stage 2 renders it. Groq is text-inference only (no image
generation endpoint), so rendering asks the LLM for a complete self-contained
SVG document — browsers render SVG in <img> natively, and the whole pipeline
works with just a Groq key. To use a real image-generation provider later,
replace only `_render_svg` — the spec/crafting stage and everything outside
this file stay unchanged."""

import re

from app import llm
from app.generators import GenOutput, Generator, GeneratorError, Kind, Progress, Request, parse_json_object
from app.models import Artifact

SPEC_SCHEMA = """Respond with ONLY a JSON object of this exact shape:
{
  "title": "short artifact title",
  "image_prompt": "a detailed visual specification: overall layout, each section in order, every text label to render verbatim, iconography described in words, and an exact color palette with hex codes",
  "caption": "1-2 sentence caption describing the finished visual"
}"""

SVG_INSTRUCTIONS = """You are a precise SVG illustrator. Render the following visual specification
as ONE complete, self-contained SVG document.

Hard requirements:
- Respond with ONLY the SVG markup. No markdown fences, no explanation before or after.
- Start with <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100" ...> and end with </svg>.
- No external references of any kind: no <image href>, no external fonts, no scripts, no CSS imports.
  Use font-family="sans-serif" only.
- All text must be <text>/<tspan> elements with explicit x/y coordinates. Keep every line under 40
  characters; break longer labels into multiple tspans.
- Build icons from basic shapes (rect, circle, path, line, polygon). Keep them simple.
- Ensure nothing overlaps: leave at least 24px vertical spacing between sections.
- Use the palette from the specification; give the root a solid background rect.

VISUAL SPECIFICATION:
"""


class ImageGenerator(Generator):
    kind = Kind.IMAGE

    async def generate(self, req: Request, progress: Progress) -> GenOutput:
        title = self.output_type.label
        caption = ""
        image_prompt = req.image_prompt_override.strip()

        # Stage 1 — craft the visual spec (skipped when the operator edited it).
        if not image_prompt:
            await progress("crafting_prompt", "Designing the visual...")

            parts = [self.cfg.system, self.output_type.system]
            parts.extend(f"- {ins}" for ins in self.output_type.instructions)
            if self.output_type.image_style:
                parts.append(f"- Visual style: {self.output_type.image_style}")
            if params := self.parameters_block(req.options):
                parts.append(params)
            parts.append(SPEC_SCHEMA)
            parts.append(self.source_section(req.source))
            prompt = "\n\n".join(p for p in parts if p)

            if req.source.image_bytes is not None:
                messages = [llm.multimodal_message("user", prompt, req.source.image_bytes, req.source.image_mime)]
            else:
                messages = [llm.text_message("user", prompt)]

            parsed = parse_json_object(await self.client.chat(messages, json_mode=True))
            image_prompt = str(parsed.get("image_prompt", "")).strip()
            if not image_prompt:
                raise GeneratorError("model returned an empty visual specification")
            caption = str(parsed.get("caption", ""))
            title = str(parsed.get("title", "")) or title

        # Stage 2 — render the spec as SVG.
        await progress("rendering_image", "Rendering the visual...")
        svg = await self._render_svg(image_prompt)

        return GenOutput(
            artifact=Artifact(
                kind=Kind.IMAGE.value,
                title=title,
                body_markdown=caption,
                image_prompt=image_prompt,
                # image_path is filled by the runner, which owns the data directory.
            ),
            files={"image_path": (svg.encode("utf-8"), ".svg")},
        )

    async def _render_svg(self, spec: str) -> str:
        raw = await self.client.chat([llm.text_message("user", SVG_INSTRUCTIONS + spec)], json_mode=False)

        # Tolerate a fenced or prefixed response, then hard-validate the shape.
        raw = re.sub(r"^```(?:svg|xml)?\s*", "", raw.strip())
        raw = re.sub(r"\s*```$", "", raw).strip()
        start = raw.find("<svg")
        end = raw.rfind("</svg>")
        if start == -1 or end == -1:
            raise GeneratorError("model did not return a valid SVG document")
        svg = raw[start : end + len("</svg>")]

        # Strip anything that could execute or fetch — defense in depth before
        # the file is ever served to a browser.
        svg = re.sub(r"<script\b.*?</script>", "", svg, flags=re.DOTALL | re.IGNORECASE)
        svg = re.sub(r"\son\w+\s*=\s*\"[^\"]*\"", "", svg, flags=re.IGNORECASE)
        svg = re.sub(r"<image\b[^>]*>", "", svg, flags=re.IGNORECASE)
        return svg
