"""Env + prompts.json loading. Output types are configuration, not code."""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
PROMPTS_PATH = Path(os.getenv("PROMPTS_PATH", Path(__file__).parent / "prompts.json"))

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://sih:sih@localhost:5434/sih_transform",
)

# Groq (api.groq.com) — OpenAI-compatible text inference. Model catalog moves
# fast; check console.groq.com/docs/models if a default gets deprecated.
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "openai/gpt-oss-120b")
# Used automatically whenever a message carries an image part (image sources).
GROQ_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.6-27b")

# Headroom for one deliverable. The default chat model is a *reasoning* model:
# its thinking tokens spend the same completion budget as the answer, and in
# JSON mode a response truncated mid-document is rejected server-side as
# json_validate_failed (no partial content returned). A tight budget therefore
# starves the deliverable twice — less thinking AND less room to finish — which
# shows up as thin, corner-cutting output. 8000 gives high-effort reasoning
# plus a fully developed deliverable comfortable room.
#
# Groq counts prompt + this reservation against the account's per-minute token
# limit; when that makes a request too large the API rejects it with 413 and
# the client halves the reservation and retries (see llm._post), so
# constrained tiers degrade to a smaller budget instead of failing.
GROQ_MAX_TOKENS = int(os.getenv("GROQ_MAX_TOKENS", "8000"))

# Ceiling on how much SOURCE material goes into one prompt, in characters
# (~4 chars/token). The free tier's per-minute window covers prompt +
# response together, so a long document (a research paper runs 40k+ chars)
# cannot fit and would be rejected outright with 413. Longer sources are
# truncated to this budget with a visible marker rather than failing.
MAX_SOURCE_CHARS = int(os.getenv("MAX_SOURCE_CHARS", "14000"))
# low | medium | high. This is a considered content-generation tool, not live
# chat: planning before writing is what keeps a deliverable cohesive instead
# of a rough draft, so spend reasoning freely — GROQ_MAX_TOKENS is sized to
# fit thinking plus the full deliverable.
GROQ_REASONING_EFFORT = os.getenv("GROQ_REASONING_EFFORT", "high")

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")


@dataclass
class Parameter:
    """One entry in prompts.json's "parameters" list — an operator-configurable
    generation knob. kind "text" fills the value into prompt_template; kind
    "select" maps the chosen option key to its hint text."""

    key: str
    label: str
    kind: str  # "text" | "select"
    placeholder: str = ""
    prompt_template: str = ""
    options: dict[str, str] = field(default_factory=dict)


@dataclass
class OutputType:
    """One entry in prompts.json's "types" list — all 7 core types are text
    deliverables, so entries no longer carry `kind`."""

    type: str
    label: str
    description: str = ""
    system: str = ""
    instructions: list[str] = field(default_factory=list)
    # Legacy generator-dispatch fields, absent from prompts.json; removal is
    # SPEC §8 item 4 (with generators/image.py).
    kind: str = "text"
    image_style: str = ""


@dataclass
class PromptConfig:
    system: str
    parameters: list[Parameter]
    types: list[OutputType]

    def type_by_key(self, key: str) -> OutputType | None:
        return next((t for t in self.types if t.type == key), None)


def load_prompts(path: Path = PROMPTS_PATH) -> PromptConfig:
    raw = json.loads(path.read_text(encoding="utf-8"))
    types = [OutputType(**entry) for entry in raw.get("types", [])]
    if not types:
        raise ValueError(f"{path} has no output types")
    return PromptConfig(
        system=raw.get("system", ""),
        parameters=[Parameter(**entry) for entry in raw.get("parameters", [])],
        types=types,
    )
