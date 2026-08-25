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
