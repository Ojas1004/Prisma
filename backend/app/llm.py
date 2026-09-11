"""OpenAI-compatible chat-completions client. The upstream is Groq
(api.groq.com) by default; setting LLM_PROVIDER=openrouter points the same
client at OpenRouter instead (local testing only — see config.LLM_PROVIDER).
Text inference only, no image generation endpoint. Vision (image input)
requires a multimodal model, so the client auto-selects the configured vision
model whenever a message carries image parts."""

import asyncio
import base64
import logging
import re
from dataclasses import dataclass

import httpx

from app import config

log = logging.getLogger("llm")

# Cap on how long one attempt will sleep for a rate limit, so a job can't
# stall behind an absurd server hint (the job itself has its own timeout).
MAX_RETRY_WAIT_SECONDS = 30.0

# Quality-sized completion budgets consume most of a small per-minute token
# window, so consecutive deliverables in one job routinely need the window to
# roll over between calls. Waiting out several short server hints is the
# normal path on constrained tiers, not an edge case — be patient.
MAX_ATTEMPTS = 6

# Never shrink the completion reservation below this — under it, deliverables
# get truncated mid-document rather than merely being short.
MIN_COMPLETION_TOKENS = 1500

# What Groq accepts for the text model (console.groq.com/docs/reasoning).
# The vision model takes none|default instead and is remapped in chat().
VALID_EFFORTS = ("low", "medium", "high")


class GroqError(Exception):
    pass


@dataclass
class ChatResult:
    """A completion plus what it actually cost in effort terms.

    `requested` is what the caller asked for; `applied` is the rung the
    ladder finished on. They differ only when a downgrade happened, which
    `downgraded` reports directly so callers don't re-derive it."""

    text: str
    requested: str
    applied: str
    downgrade_reason: str = ""

    @property
    def downgraded(self) -> bool:
        return bool(self.downgrade_reason) and self.applied != self.requested


def text_message(role: str, text: str) -> dict:
    return {"role": role, "content": text}


def multimodal_message(role: str, text: str, image_bytes: bytes, mime_type: str) -> dict:
    """Chat turn carrying text plus one inline image as a data-URI part."""
    data_url = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"
    return {
        "role": role,
        "content": [
            {"type": "text", "text": text},
            {"type": "image_url", "image_url": {"url": data_url}},
        ],
    }


def _has_image_parts(messages: list[dict]) -> bool:
    return any(isinstance(m.get("content"), list) for m in messages)


def _retry_after_seconds(resp: httpx.Response) -> float:
    """How long Groq wants us to wait, from the Retry-After header or the
    'try again in 18.33s' hint in the error body. 0 = no usable hint."""
    header = resp.headers.get("retry-after", "")
    try:
        return min(float(header), MAX_RETRY_WAIT_SECONDS)
    except ValueError:
        pass
    match = re.search(r"try again in ([\d.]+)s", resp.text)
    if match:
        # Small cushion: the window is measured server-side.
        return min(float(match.group(1)) + 1.0, MAX_RETRY_WAIT_SECONDS)
    return 0.0


def _is_request_too_large(resp: httpx.Response) -> bool:
    """413: prompt + max_tokens reservation exceeds the per-minute token
    limit. Unlike a 429 this never heals by waiting — the request itself has
    to get smaller."""
    return resp.status_code == 413


def _is_json_validate_failure(resp: httpx.Response) -> bool:
    """Groq rejects a JSON-mode response it could not validate (typically one
    truncated mid-document) with a 400 and no usable content."""
    if resp.status_code != 400:
        return False
    try:
        return resp.json().get("error", {}).get("code") == "json_validate_failed"
    except ValueError:
        return False


class GroqClient:
    """Chat-completions client for whichever provider config.LLM_PROVIDER
    selects. Both supported providers (Groq, OpenRouter) speak the same
    OpenAI-compatible chat-completions protocol, so the provider affects
    nothing below __init__ — the retry, rate-limit and truncation-cascade
    logic is shared verbatim."""

    def __init__(self) -> None:
        if config.LLM_PROVIDER == "openrouter":
            if not config.OPENROUTER_API_KEY:
                raise GroqError("OPENROUTER_API_KEY is not set (LLM_PROVIDER=openrouter)")
            self.provider = "openrouter"
            api_key = config.OPENROUTER_API_KEY
            base_url = config.OPENROUTER_BASE_URL
            self.chat_model = config.OPENROUTER_CHAT_MODEL
            self.vision_model = config.OPENROUTER_VISION_MODEL
        elif config.LLM_PROVIDER == "groq":
            if not config.GROQ_API_KEY:
                raise GroqError("GROQ_API_KEY is not set")
            self.provider = "groq"
            api_key = config.GROQ_API_KEY
            base_url = config.GROQ_BASE_URL
            self.chat_model = config.GROQ_CHAT_MODEL
            self.vision_model = config.GROQ_VISION_MODEL
        else:
            raise GroqError(
                f"unknown LLM_PROVIDER {config.LLM_PROVIDER!r} — expected 'groq' or 'openrouter'"
            )

        log.info(
            "[llm] using provider: %s, model: %s (vision: %s, base_url: %s)",
            self.provider, self.chat_model, self.vision_model, base_url,
        )
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(300.0, connect=15.0),
        )

    async def chat(
        self,
        messages: list[dict],
        json_mode: bool = False,
        reasoning_effort: str = "",
        max_tokens: int = 0,
        label: str = "",
    ) -> ChatResult:
        """Call the chat model (vision model when images are attached) and
        return the assistant text.

        `reasoning_effort` overrides the configured default for this one call.
        Groq documents low|medium|high for gpt-oss-120b; the vision model only
        accepts none|default, which is handled below.

        `max_tokens` overrides the completion reservation for this one call.
        The default is sized for a full deliverable; a caller whose output is
        short and hard-capped downstream (the digest map step) reserves far
        less, so more of its calls fit the account's per-minute token window.

        `label` tags this call in the truncation-cascade logs (for example
        "map chunk 3/5") so a map-step escalation is distinguishable from a
        deliverable-generation one when reading production logs."""
        is_vision = _has_image_parts(messages)
        payload: dict = {
            "model": self.vision_model if is_vision else self.chat_model,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": max_tokens or config.GROQ_MAX_TOKENS,
        }
        # Reasoning models spend completion budget on thinking; unbounded, they
        # can exhaust it before closing the JSON document. Models disagree on
        # the accepted vocabulary, though: the vision model rejects anything
        # but "none"/"default", so send the value that model understands.
        # Per-request override wins over the server default; an unknown value
        # is ignored rather than passed through to the API.
        effort = reasoning_effort if reasoning_effort in VALID_EFFORTS else config.GROQ_REASONING_EFFORT
        if is_vision:
            effort = "none" if effort not in ("none", "default") else effort
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        # Thinking and the answer share one completion budget, and a
        # constrained tier can shrink that budget mid-flight (413 halving).
        # When the model keeps dying mid-JSON because thinking ate the budget,
        # resampling at the same effort is futile — step the effort down and
        # let the deliverable have the tokens instead. Full-budget accounts
        # never leave the first rung.
        ladder = {"high": ["high", "medium", "low"], "medium": ["medium", "low"]}.get(effort, [effort])

        # Last resort once the effort ladder is spent: the answer itself needs
        # more room than the current reservation allows. Thinking and the answer
        # share one completion budget, so at the bottom rung the only remaining
        # lever is a bigger reservation. Each step is capped at GROQ_MAX_TOKENS
        # so this can never exceed what the tier allows.
        budget_steps = 2

        data: dict = {}
        applied = effort
        downgrade_reason = ""
        i = 0
        budget_bumps = 0
        while True:
            eff = ladder[i]
            if eff:
                payload["reasoning_effort"] = eff
            truncated = False
            try:
                data = await self._post("/chat/completions", payload)
                # A response truncated mid-answer is the same failure as a
                # mid-JSON one: the completion budget ran out. Treat it as a
                # downgrade trigger instead of a hard error, so the ladder and
                # the budget escape below both get a chance.
                ch = (data.get("choices") or [{}])[0]
                if ch.get("finish_reason") == "length":
                    truncated = True
                else:
                    applied = eff
                    break
            except GroqError as exc:
                if "json_validate_failed" not in str(exc):
                    raise
                truncated = True

            if truncated:
                reservation = payload.get("max_tokens", config.GROQ_MAX_TOKENS)
                if i < len(ladder) - 1:
                    # Rung available: spend less on thinking, leave more for
                    # the answer.
                    downgrade_reason = "completion budget exhausted while reasoning"
                    log.warning(
                        "[groq][effort-downgrade]%s truncated, escalating: "
                        "requested=%s from=%s to=%s reason=%s model=%s max_tokens=%s",
                        f" {label}:" if label else "",
                        effort, eff, ladder[i + 1], downgrade_reason,
                        payload.get("model"), reservation,
                    )
                    i += 1
                    continue
                if budget_bumps < budget_steps and reservation < config.GROQ_MAX_TOKENS:
                    # Bottom rung already: the only lever left is a larger
                    # reservation, capped at the configured ceiling.
                    raised = min(reservation * 2, config.GROQ_MAX_TOKENS)
                    downgrade_reason = "completion budget raised after truncation"
                    log.warning(
                        "[groq][budget-raise]%s truncated, escalating: "
                        "effort=%s max_tokens=%d -> %d (cap %d)",
                        f" {label}:" if label else "",
                        eff, reservation, raised, config.GROQ_MAX_TOKENS,
                    )
                    payload["max_tokens"] = raised
                    budget_bumps += 1
                    continue
                where = f"{label} " if label else ""
                raise GroqError(
                    f"{where}response hit the {reservation}-token limit before "
                    "finishing, after the effort ladder and "
                    f"{budget_bumps} budget increase(s) were exhausted — "
                    "raise GROQ_MAX_TOKENS or shorten the source"
                )

        choices = data.get("choices") or []
        if not choices:
            raise GroqError(f"empty response from {payload['model']}")

        content = choices[0].get("message", {}).get("content", "")
        finish_reason = choices[0].get("finish_reason", "")
        if not content:
            raise GroqError(f"empty response from {payload['model']} (finish_reason={finish_reason!r})")
        return ChatResult(
            text=content,
            requested=effort,
            applied=applied,
            downgrade_reason=downgrade_reason if applied != effort else "",
        )

    async def _post(self, path: str, payload: dict) -> dict:
        """JSON POST with up to MAX_ATTEMPTS attempts, backing off on 429/5xx —
        per-minute rate limits are the common failure mode."""
        last_error: Exception = GroqError("request not attempted")
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                resp = await self._client.post(path, json=payload)
                if resp.status_code == 200:
                    return resp.json()
                body_preview = resp.text[:300]
                last_error = GroqError(f"groq {path}: status {resp.status_code}: {body_preview}")

                # 413: the reservation itself is too big for the token
                # window. Waiting cannot help, but a smaller reservation can —
                # real deliverables need far less than the default.
                if _is_request_too_large(resp):
                    current = payload.get("max_tokens", config.GROQ_MAX_TOKENS)
                    shrunk = int(current * 0.5)
                    if attempt < MAX_ATTEMPTS and shrunk >= MIN_COMPLETION_TOKENS:
                        log.warning(
                            "[groq] attempt %d/%d: request too large, retrying with max_tokens=%d",
                            attempt, MAX_ATTEMPTS, shrunk,
                        )
                        payload["max_tokens"] = shrunk
                        continue
                    raise GroqError(
                        "request too large for the account's per-minute token limit — "
                        "the source content plus the reserved response size exceed it. "
                        "Shorten the source text, select fewer output types, or lower "
                        "GROQ_MAX_TOKENS"
                    )

                # json_validate_failed means the model ran out of completion
                # budget mid-document — the response is discarded server-side,
                # so no partial content comes back. One resample covers bad
                # luck; beyond that the budget is genuinely too tight for the
                # current reasoning effort, and the caller's effort ladder is
                # the fix, not more identical samples.
                if _is_json_validate_failure(resp):
                    last_error = GroqError(
                        "model did not finish a valid JSON document (Groq json_validate_failed) — "
                        "usually the completion budget ran out mid-response; "
                        "raise GROQ_MAX_TOKENS or lower GROQ_REASONING_EFFORT"
                    )
                    if attempt < 2:
                        log.warning("[groq] attempt %d: json_validate_failed, resampling once", attempt)
                        await asyncio.sleep(1)
                        continue
                    raise last_error

                # 4xx other than 429 won't heal on retry.
                if resp.status_code != 429 and resp.status_code < 500:
                    raise last_error
                # 429: obey the server's own wait hint — the free tier's
                # token-per-minute window needs far longer than a short backoff.
                if resp.status_code == 429:
                    delay = _retry_after_seconds(resp) or attempt * 2
                    if attempt < MAX_ATTEMPTS:
                        log.warning("[groq] attempt %d/%d: rate limited, waiting %.1fs", attempt, MAX_ATTEMPTS, delay)
                        await asyncio.sleep(delay)
                        continue
                    raise last_error
            except GroqError:
                raise
            except httpx.HTTPError as exc:
                last_error = exc
            if attempt < MAX_ATTEMPTS:
                log.warning("[groq] attempt %d/%d failed: %s", attempt, MAX_ATTEMPTS, last_error)
                await asyncio.sleep(attempt * 2)
        raise GroqError(str(last_error))

    async def count_tokens(self, text: str) -> int:
        """Not available on this provider.

        Neither Groq nor OpenRouter exposes a token-count endpoint, so the
        single-call fast-path decision in sources.py cannot be made from a
        real count here. Raising keeps the contract honest: the caller falls
        back to the chars/4 estimate and the conservative chunking path,
        which is exactly the pre-Gemini behavior."""
        raise GroqError(f"count_tokens is not supported by provider {self.provider!r}")

    async def close(self) -> None:
        await self._client.aclose()
