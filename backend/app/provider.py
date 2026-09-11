"""Provider selection and cross-provider quota fallback.

`build_client()` returns the client config.LLM_PROVIDER asks for. When a
fallback provider is configured and usable, it returns a FallbackClient that
wraps both: every call goes to the primary, and a QUOTA failure — and only a
quota failure — is retried once on the secondary before the job fails.

Why quota specifically: the free tiers this project runs on have hard daily
walls that waiting cannot clear, and they are on different clocks.

  * Gemini: GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20 requests
    per day (observed 11 Sep 2026), resetting on Pacific midnight.
  * Groq: 200,000 tokens per day on the on_demand tier (observed 12 Sep 2026:
    "tokens per day (TPD): Limit 200000, Used 197418").

Each client already retries its own transient 429s internally with the
server's Retry-After hint; by the time a GroqError escapes, that patience is
spent and the same provider will keep refusing. Switching providers is the
only remaining move, and because the two quotas are independent it usually
works.

Deliberately NOT retried on the other provider: truncation, invalid JSON,
empty responses, auth failures, unknown models. Those are not capacity
problems — they would fail identically on the secondary, so a retry would
just double the latency and the token spend.

Every client here exposes the same surface — chat(), count_tokens(),
chat_model, vision_model, close() — so digest.py, generators/ and main.py stay
provider-agnostic.
"""

import logging

from app import config, timing
from app.llm import GroqClient, GroqError

log = logging.getLogger("llm")

# Substrings that mark a capacity/quota refusal rather than a bad request.
# Matched case-insensitively against the raised GroqError's message, which
# carries the upstream body verbatim on both providers (verified against the
# real Gemini RESOURCE_EXHAUSTED and Groq TPD errors).
_QUOTA_MARKERS = (
    "429",
    "rate limit",
    "resource_exhausted",
    "quota",
    "tokens per day",
    "tpd",
    "requests per day",
    "rpd",
)


def is_quota_error(exc: BaseException) -> bool:
    """True when `exc` means "no capacity right now", not "bad request"."""
    return any(m in str(exc).lower() for m in _QUOTA_MARKERS)


def _make(provider: str):
    """Build one raw (non-wrapping) client for `provider`."""
    if provider == "gemini":
        # Imported lazily so a groq-only setup does not need google-genai.
        from app.gemini import GeminiClient

        return GeminiClient()
    if provider in ("groq", "openrouter"):
        # Pass the name explicitly: this may be the SECONDARY while gemini is
        # primary, in which case the global config.LLM_PROVIDER is "gemini".
        return GroqClient(provider=provider)
    raise GroqError(
        f"unknown LLM_PROVIDER {provider!r} — expected 'gemini', 'groq' or 'openrouter'"
    )


class FallbackClient:
    """Primary client with a secondary used only on quota exhaustion.

    Presents the primary's model identity, since that is what serves the
    common case and what the UI records. `served_by` counts calls per provider
    so the timing report can show how often fallback actually fired.
    """

    def __init__(self, primary, secondary, primary_name: str, secondary_name: str) -> None:
        self.primary = primary
        self.secondary = secondary
        self.primary_name = primary_name
        self.secondary_name = secondary_name
        self.provider = primary_name
        self.chat_model = primary.chat_model
        self.vision_model = primary.vision_model
        self.served_by: dict[str, int] = {primary_name: 0, secondary_name: 0}
        log.info(
            "[llm] fallback enabled: %s (primary, %s) -> %s (secondary, %s) "
            "on quota exhaustion",
            primary_name, primary.chat_model, secondary_name, secondary.chat_model,
        )

    async def chat(self, messages, **kwargs):
        label = kwargs.get("label") or "call"
        try:
            result = await self.primary.chat(messages, **kwargs)
        except GroqError as exc:
            if not is_quota_error(exc):
                # Not a capacity problem — the secondary would fail the same
                # way, so surface it immediately.
                raise
            log.warning(
                "[llm][fallback] %s: %s quota exhausted (%s) — retrying on %s",
                label, self.primary_name, str(exc)[:160], self.secondary_name,
            )
            async with timing.step(
                f"fallback:{self.primary_name}->{self.secondary_name}",
                f"{label}; {self.primary_name} quota exhausted",
            ):
                try:
                    result = await self.secondary.chat(messages, **kwargs)
                except GroqError as exc2:
                    # Both providers out: report both causes, since "Gemini is
                    # out AND Groq is out" needs a different action from either
                    # one alone.
                    raise GroqError(
                        f"{label}: both providers unavailable — "
                        f"{self.primary_name}: {str(exc)[:200]} | "
                        f"{self.secondary_name}: {str(exc2)[:200]}"
                    ) from exc2
            self.served_by[self.secondary_name] += 1
            log.info(
                "[llm][fallback] %s: served by %s (%s)",
                label, self.secondary_name, self.secondary.chat_model,
            )
            timing.annotate(f"served_by={self.secondary_name}")
            return result
        self.served_by[self.primary_name] += 1
        timing.annotate(f"served_by={self.primary_name}")
        return result

    async def count_tokens(self, text: str) -> int:
        """Count on whichever client can. The primary's tokenizer is the right
        one when the primary serves the call; if it cannot count at all (Groq
        has no such endpoint) try the secondary rather than forcing the
        caller's conservative estimate path."""
        try:
            return await self.primary.count_tokens(text)
        except GroqError:
            return await self.secondary.count_tokens(text)

    def summary(self) -> str:
        """One line for the timing report: who actually served the calls."""
        total = sum(self.served_by.values())
        if not total:
            return "no calls"
        parts = [
            f"{name}={n} ({n / total * 100:.0f}%)"
            for name, n in self.served_by.items()
            if n
        ]
        return ", ".join(parts)

    async def close(self) -> None:
        for c in (self.primary, self.secondary):
            try:
                await c.close()
            except Exception:  # noqa: BLE001 — shutdown is best-effort
                log.exception("[llm] error closing a client")


def build_client():
    """Instantiate the configured provider, wrapped for fallback if possible.

    Returns a bare client when no fallback is configured, when the fallback is
    the same provider, or when the fallback cannot be constructed (its key is
    missing) — in that last case the primary still works, so a missing
    secondary key is a warning, never a startup failure.
    """
    primary_name = config.LLM_PROVIDER
    primary = _make(primary_name)

    secondary_name = config.LLM_FALLBACK_PROVIDER
    if not secondary_name or secondary_name == primary_name:
        return primary

    try:
        secondary = _make(secondary_name)
    except GroqError as exc:
        log.warning(
            "[llm] fallback provider %r unavailable (%s) — running without "
            "fallback; a quota failure will fail the job",
            secondary_name, exc,
        )
        return primary

    return FallbackClient(primary, secondary, primary_name, secondary_name)
