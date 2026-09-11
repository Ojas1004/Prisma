"""Provider selection — returns the client config.LLM_PROVIDER asks for.

Gemini is the active path (app/gemini.py). The Groq/OpenRouter client
(app/llm.py) is deliberately left intact and reachable: LLM_PROVIDER=groq
restores the previous behavior exactly, with its truncation cascade and
413/429 handling untouched. Nothing about the old path was deleted.

Every client returned here exposes the same surface — chat(), chat_model,
vision_model, close() — so digest.py, generators/ and main.py are
provider-agnostic.
"""

from app import config
from app.llm import GroqClient, GroqError


def build_client():
    """Instantiate the configured provider's client.

    Returns GeminiClient for "gemini" (default), GroqClient for "groq" and
    "openrouter" — that one client covers both, branching internally on the
    base URL and key."""
    provider = config.LLM_PROVIDER
    if provider == "gemini":
        # Imported lazily so a groq-only rollback does not require the
        # google-genai package to be installed.
        from app.gemini import GeminiClient

        return GeminiClient()
    if provider in ("groq", "openrouter"):
        return GroqClient()
    raise GroqError(
        f"unknown LLM_PROVIDER {provider!r} — expected 'gemini', 'groq' or 'openrouter'"
    )
