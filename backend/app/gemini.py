"""Gemini client (generativelanguage.googleapis.com) via the google-genai SDK.

Exposes the SAME public surface as llm.GroqClient — `chat()` with an identical
signature returning llm.ChatResult, plus `chat_model`, `vision_model` and
`close()` — so digest.py, generators/ and main.py call it without change.
llm.py is left intact and importable for rollback.

Why the pipeline moved here: the chunking architecture in chunking.py exists to
survive Groq's 8,000 TPM cap. Gemini's free tier is ~250k TPM, so tokens per
minute stop being the binding constraint — but REQUESTS per minute and per day
become it instead. Observed directly on 11 Sep 2026: five back-to-back probe
calls were enough to trigger 429 RESOURCE_EXHAUSTED, so the per-minute ceiling
is genuinely low — check ai.google.dev/gemini-api/docs/rate-limits for the
figures on your key's tier. A 5-chunk job is 5 map calls plus one call per
deliverable, so a single multi-type run can brush the per-minute limit and a
handful of runs can exhaust a daily quota. Rate limits are therefore surfaced as hard, explicit failures
rather than silently degraded.

SDK parameter names below were read off the INSTALLED google-genai (2.23.0)
and then checked against the live API, not recalled: `max_output_tokens`,
`thinking_config` (`thinking_level` on 3.x, `thinking_budget` on 2.5 — see
THINKING_LEVELS), and `response_mime_type` for JSON mode.
"""

import asyncio
import logging

from google import genai
from google.genai import types

from app import config
from app.llm import ChatResult, GroqError, VALID_EFFORTS

log = logging.getLogger("llm")

# Same patience budget as the Groq path. Gemini's free tier limits requests
# rather than tokens, so a 429 here means "too many calls", which a short wait
# does clear (per-minute quota) — unless the daily quota is gone, which it
# does not.
MAX_ATTEMPTS = 6
MAX_RETRY_WAIT_SECONDS = 30.0

# reasoning_effort -> Gemini thinking control.
#
# Two different knobs exist and which one works depends on the model
# generation, so both are supported:
#
#   thinking_level (MINIMAL|LOW|MEDIUM|HIGH) — Gemini 3.x. Maps directly onto
#     this pipeline's low/medium/high vocabulary.
#   thinking_budget (token count) — Gemini 2.5. The SDK documents "0 is
#     DISABLED. -1 is AUTOMATIC".
#
# Verified against the live API on 11 Sep 2026: gemini-3.6-flash REJECTS
# thinking_budget=0 with 400 INVALID_ARGUMENT — thinking cannot be switched
# off on 3.x at all — while -1 and a fixed budget both work. The map step asks
# for "low", so a naive 0 would have failed every map call. Hence 3.x is driven
# by thinking_level, where MINIMAL is the floor, and only 2.5 uses budgets.
THINKING_LEVELS = {"low": "LOW", "medium": "MEDIUM", "high": "HIGH"}
THINKING_BUDGETS = {"low": 0, "medium": 4096, "high": -1}


def _uses_thinking_level(model: str) -> bool:
    """Gemini 3.x and later take thinking_level; 2.5 takes thinking_budget."""
    name = model.rsplit("/", 1)[-1]
    if not name.startswith("gemini-"):
        return True  # unknown//newer model: prefer the current-generation knob
    version = name[len("gemini-"):].split("-", 1)[0]
    try:
        return float(version.rsplit(".", 1)[0] if version.count(".") > 1 else version) >= 3
    except ValueError:
        return True


def _is_rate_limit(exc: Exception) -> bool:
    """429 / RESOURCE_EXHAUSTED from the Gemini API.

    google-genai raises ClientError carrying `code`; the string check covers
    the transport-level variants that do not."""
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if code == 429:
        return True
    blob = str(exc).upper()
    return "RESOURCE_EXHAUSTED" in blob or "429" in blob


def _retry_after_seconds(exc: Exception) -> float:
    """Gemini returns a RetryInfo hint on 429. 0 = no usable hint."""
    import re

    match = re.search(r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+(?:\.\d+)?)s", str(exc))
    if match:
        return min(float(match.group(1)) + 1.0, MAX_RETRY_WAIT_SECONDS)
    return 0.0


def _split_messages(messages: list[dict]) -> tuple[str, list]:
    """Convert OpenAI-shaped chat messages into (system_instruction, contents).

    Gemini takes the system prompt out-of-band in `system_instruction` rather
    than as a message with role "system", and names the assistant role "model".
    Image parts arrive as OpenAI data-URI dicts (llm.multimodal_message) and
    are unpacked into inline Blob parts."""
    import base64

    system_bits: list[str] = []
    contents: list = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content")
        if role == "system":
            if isinstance(content, str):
                system_bits.append(content)
            continue
        parts: list = []
        if isinstance(content, str):
            parts.append(types.Part.from_text(text=content))
        else:
            for part in content or []:
                if part.get("type") == "text":
                    parts.append(types.Part.from_text(text=part.get("text", "")))
                elif part.get("type") == "image_url":
                    url = (part.get("image_url") or {}).get("url", "")
                    if url.startswith("data:"):
                        header, _, b64 = url.partition(",")
                        mime = header[5:].split(";")[0] or "image/png"
                        parts.append(
                            types.Part.from_bytes(data=base64.b64decode(b64), mime_type=mime)
                        )
        contents.append(types.Content(role="model" if role == "assistant" else "user", parts=parts))
    return "\n\n".join(system_bits), contents


class GeminiClient:
    """Drop-in replacement for llm.GroqClient.

    Raises GroqError (the pipeline's existing error type) so runner.py and the
    generators keep their current failure handling — the name is historical,
    not provider-specific."""

    def __init__(self) -> None:
        if not config.GEMINI_API_KEY:
            raise GroqError("GEMINI_API_KEY is not set")
        self.provider = "gemini"
        self.chat_model = config.GEMINI_CHAT_MODEL
        # Gemini models are natively multimodal, so the text model reads images
        # too; no separate vision model is needed.
        self.vision_model = config.GEMINI_VISION_MODEL or config.GEMINI_CHAT_MODEL
        self._client = genai.Client(api_key=config.GEMINI_API_KEY)
        log.info(
            "[llm] using provider: gemini, model: %s (vision: %s, endpoint: generativelanguage.googleapis.com)",
            self.chat_model, self.vision_model,
        )

    async def chat(
        self,
        messages: list[dict],
        json_mode: bool = False,
        reasoning_effort: str = "",
        max_tokens: int = 0,
        label: str = "",
    ) -> ChatResult:
        """Generate a completion. Signature matches llm.GroqClient.chat.

        `reasoning_effort` maps to Gemini's thinking control (THINKING_LEVELS
        on 3.x, THINKING_BUDGETS on 2.5).
        `max_tokens` becomes max_output_tokens. `label` tags this call in the
        logs exactly as on the Groq path.

        Unlike the Groq path there is no effort ladder or budget doubling: those
        exist because a tiny TPM window forced thinking and the answer to
        compete for one cramped reservation. Gemini's window is ~30x larger and
        thinking is budgeted separately from output, so the failure they defend
        against does not arise. A truncated response is reported rather than
        silently re-sampled."""
        effort = reasoning_effort if reasoning_effort in VALID_EFFORTS else config.GEMINI_REASONING_EFFORT
        if _uses_thinking_level(self.chat_model):
            thinking = types.ThinkingConfig(thinking_level=THINKING_LEVELS.get(effort, "HIGH"))
        else:
            thinking = types.ThinkingConfig(thinking_budget=THINKING_BUDGETS.get(effort, -1))

        system_instruction, contents = _split_messages(messages)
        cfg = types.GenerateContentConfig(
            temperature=0.4,
            max_output_tokens=max_tokens or config.GEMINI_MAX_TOKENS,
            thinking_config=thinking,
        )
        if system_instruction:
            cfg.system_instruction = system_instruction
        if json_mode:
            cfg.response_mime_type = "application/json"

        where = f"{label} " if label else ""
        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                resp = await self._client.aio.models.generate_content(
                    model=self.chat_model, contents=contents, config=cfg
                )
            except Exception as exc:  # SDK raises ClientError/ServerError/APIError
                last_error = exc
                if _is_rate_limit(exc):
                    # Daily quota exhaustion never heals inside one job; only a
                    # per-minute window does. The message says both so the
                    # operator knows which wait applies.
                    delay = _retry_after_seconds(exc) or attempt * 2
                    if attempt < MAX_ATTEMPTS:
                        log.warning(
                            "[gemini]%s attempt %d/%d: rate limited, waiting %.1fs",
                            f" {label}:" if label else "", attempt, MAX_ATTEMPTS, delay,
                        )
                        await asyncio.sleep(delay)
                        continue
                    raise GroqError(
                        f"{where}generation provider rate limit reached, please retry shortly "
                        "— Gemini free tier limits requests per minute and per day; "
                        "if this persists the daily quota is exhausted"
                    ) from exc
                if attempt < MAX_ATTEMPTS and _is_retryable(exc):
                    log.warning(
                        "[gemini]%s attempt %d/%d failed: %s",
                        f" {label}:" if label else "", attempt, MAX_ATTEMPTS, str(exc)[:200],
                    )
                    await asyncio.sleep(attempt * 2)
                    continue
                raise GroqError(f"{where}gemini {self.chat_model}: {str(exc)[:300]}") from exc

            text = (resp.text or "").strip()
            finish = _finish_reason(resp)
            if not text:
                # MAX_TOKENS with no text means the thinking budget consumed the
                # whole output allowance before the answer began.
                if finish == "MAX_TOKENS":
                    raise GroqError(
                        f"{where}response hit the "
                        f"{max_tokens or config.GEMINI_MAX_TOKENS}-token limit before any "
                        "output was produced — raise GEMINI_MAX_TOKENS or lower "
                        "GEMINI_REASONING_EFFORT"
                    )
                raise GroqError(
                    f"{where}empty response from {self.chat_model} (finish_reason={finish!r})"
                )
            if finish == "MAX_TOKENS":
                log.warning(
                    "[gemini]%s response truncated at the output limit (%d tokens)",
                    f" {label}:" if label else "", max_tokens or config.GEMINI_MAX_TOKENS,
                )
            return ChatResult(text=text, requested=effort, applied=effort)

        raise GroqError(f"{where}gemini request failed: {last_error}")

    async def count_tokens(self, text: str) -> int:
        """Real token count from the API (AsyncModels.count_tokens), not a
        chars/4 heuristic.

        Used by sources.py to decide between the single-call fast path and
        map-reduce chunking. Measured 11 Sep 2026: the Attention paper is
        32,623 chars = 8,718 real tokens, which chars/4 underestimates by ~7%
        — enough to matter at a threshold boundary, hence the real call.

        Raises GroqError on failure so the caller can fall through to the
        conservative chunking path rather than guessing."""
        try:
            resp = await self._client.aio.models.count_tokens(
                model=self.chat_model, contents=text
            )
        except Exception as exc:
            raise GroqError(f"count_tokens failed: {str(exc)[:200]}") from exc
        total = getattr(resp, "total_tokens", None)
        if not isinstance(total, int):
            raise GroqError(f"count_tokens returned no total_tokens ({resp!r})")
        return total

    async def close(self) -> None:
        """No persistent connection to release; present for interface parity
        with llm.GroqClient so main.py's shutdown path is unchanged."""
        return None


def _is_retryable(exc: Exception) -> bool:
    """5xx and transport errors heal on retry; 4xx (bad key, bad model, bad
    request) never do."""
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if isinstance(code, int):
        return code >= 500
    return "DEADLINE_EXCEEDED" in str(exc).upper() or "UNAVAILABLE" in str(exc).upper()


def _finish_reason(resp) -> str:
    try:
        return str(resp.candidates[0].finish_reason.name)
    except (AttributeError, IndexError, TypeError):
        return ""
