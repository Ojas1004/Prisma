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

# Which upstream serves generation: "gemini" (default), "groq" or
# "openrouter".
#
# Gemini is the primary provider: Groq's 8,000 TPM cap — the constraint the
# whole chunking architecture in chunking.py was built to survive — made its
# daily quota too tight for real use. Gemini's free tier is ~250k TPM, so
# tokens per minute is no longer the binding constraint; REQUESTS per minute
# and per day are (see app/gemini.py). Groq and OpenRouter remain fully
# functional for rollback: set LLM_PROVIDER=groq to restore the previous
# behavior exactly.
#
# groq/openrouter share one OpenAI-compatible client (app/llm.py) and differ
# only in base URL, key and model string. Gemini uses the google-genai SDK
# (app/gemini.py) and deliberately exposes the identical chat() surface, so no
# call site changes.
#
# Environment variables:
#   LLM_PROVIDER=gemini|groq|openrouter   # default "gemini" when unset
#   GEMINI_API_KEY=AIza…                  # required when provider is gemini
#   GEMINI_MODEL=gemini-2.5-flash         # optional override
#   OPENROUTER_API_KEY=sk-or-…            # required when provider is openrouter
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").strip().lower() or "gemini"

# Gemini (aistudio.google.com/apikey) — primary provider. Free-tier limits are
# per-REQUEST (roughly 10 RPM / 250 RPD on 2.5 Flash) rather than per-token;
# current figures: ai.google.dev/gemini-api/docs/rate-limits
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# gemini-2.5-flash is retired for new API keys (404: "no longer available to
# new users"), so the default is the 3.x flash Google's own error points at.
GEMINI_CHAT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
# Gemini models are natively multimodal, so the text model reads images too.
GEMINI_VISION_MODEL = os.getenv("GEMINI_VISION_MODEL", "")
# Output-token ceiling (SDK: max_output_tokens). Higher than GROQ_MAX_TOKENS
# because Gemini budgets thinking separately from output, so the reservation no
# longer has to cover both.
GEMINI_MAX_TOKENS = int(os.getenv("GEMINI_MAX_TOKENS", "8192"))
# low | medium | high — mapped to a thinking budget in app/gemini.py.
GEMINI_REASONING_EFFORT = os.getenv("GEMINI_REASONING_EFFORT", "high")

# Groq (api.groq.com) — OpenAI-compatible text inference. Model catalog moves
# fast; check console.groq.com/docs/models if a default gets deprecated.
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "openai/gpt-oss-120b")
# Used automatically whenever a message carries an image part (image sources).
GROQ_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.6-27b")

# OpenRouter (openrouter.ai) — alternate provider for local testing only.
# The ":free" suffix selects the no-cost pool; without it the id resolves to
# the paid variant, so never drop it from these defaults.
#
# NOT openai/gpt-oss-120b:free — that slug 404s (removed from the catalog on
# 11 Sep 2026; OpenRouter's own error points at the paid slug instead).
# NOT nvidia/nemotron-3-super-120b-a12b:free either — it returns its reasoning
# AS the content (identical `reasoning` and `content` fields), so under the
# map step's small budget the answer never begins and the job dies with
# "empty response".
# nex-n2.5-pro is the free stand-in that actually works: it supports both
# response_format json_object (the map step needs it) and reasoning_effort
# (so the effort ladder still applies), and keeps reasoning out of content.
# Verify a slug is still live before changing these:
#   curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
#        https://openrouter.ai/api/v1/models
# and keep only entries whose pricing.prompt and pricing.completion are "0"
# (prices come back as strings, and an "overrides" array can reintroduce cost
# above a token threshold).
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_CHAT_MODEL = os.getenv("OPENROUTER_CHAT_MODEL", "nex-agi/nex-n2.5-pro:free")
OPENROUTER_VISION_MODEL = os.getenv("OPENROUTER_VISION_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free")

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
