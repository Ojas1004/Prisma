"""Groq API client (api.groq.com). The API is OpenAI-compatible chat
completions — text-inference only, no image generation endpoint. Vision (image
input) requires a multimodal model, so the client auto-selects the configured
vision model whenever a message carries image parts."""

import asyncio
import base64
import logging
import re

import httpx

from app import config

log = logging.getLogger("llm")

# Cap on how long one attempt will sleep for a rate limit, so a job can't
# stall behind an absurd server hint (the job itself has its own timeout).
MAX_RETRY_WAIT_SECONDS = 30.0


class GroqError(Exception):
    pass


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
    def __init__(self) -> None:
        if not config.GROQ_API_KEY:
            raise GroqError("GROQ_API_KEY is not set")
        self.chat_model = config.GROQ_CHAT_MODEL
        self.vision_model = config.GROQ_VISION_MODEL
        self._client = httpx.AsyncClient(
            base_url=config.GROQ_BASE_URL,
            headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
            timeout=httpx.Timeout(300.0, connect=15.0),
        )

    async def chat(self, messages: list[dict], json_mode: bool = False) -> str:
        """Call the chat model (vision model when images are attached) and
        return the assistant text."""
        payload: dict = {
            "model": self.vision_model if _has_image_parts(messages) else self.chat_model,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": config.GROQ_MAX_TOKENS,
            # Reasoning models spend completion budget on thinking; unbounded,
            # they can exhaust it before closing the JSON document.
            "reasoning_effort": config.GROQ_REASONING_EFFORT,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        data = await self._post("/chat/completions", payload)
        choices = data.get("choices") or []
        if not choices:
            raise GroqError(f"empty response from {payload['model']}")

        # A truncated answer is a silent corruption in non-JSON mode and a
        # server-side 400 in JSON mode — surface it as an actionable error.
        finish_reason = choices[0].get("finish_reason", "")
        content = choices[0].get("message", {}).get("content", "")
        if finish_reason == "length":
            raise GroqError(
                f"response hit the {config.GROQ_MAX_TOKENS}-token limit before finishing — "
                "raise GROQ_MAX_TOKENS or request a shorter deliverable"
            )
        if not content:
            raise GroqError(f"empty response from {payload['model']} (finish_reason={finish_reason!r})")
        return content

    async def _post(self, path: str, payload: dict) -> dict:
        """JSON POST with up to 3 attempts, backing off on 429/5xx — free-tier
        rate limits are the common failure mode."""
        last_error: Exception = GroqError("request not attempted")
        for attempt in range(1, 4):
            try:
                resp = await self._client.post(path, json=payload)
                if resp.status_code == 200:
                    return resp.json()
                body_preview = resp.text[:300]
                last_error = GroqError(f"groq {path}: status {resp.status_code}: {body_preview}")

                # json_validate_failed means the model ran out of completion
                # budget mid-document — the response is discarded server-side,
                # so no partial content comes back. Worth one more sampling
                # attempt; if it keeps happening the budget is genuinely tight.
                if _is_json_validate_failure(resp):
                    last_error = GroqError(
                        "model did not finish a valid JSON document (Groq json_validate_failed) — "
                        "usually the completion budget ran out mid-response; "
                        "raise GROQ_MAX_TOKENS or lower GROQ_REASONING_EFFORT"
                    )
                    if attempt < 3:
                        log.warning("[groq] attempt %d/3: json_validate_failed, resampling", attempt)
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
                    if attempt < 3:
                        log.warning("[groq] attempt %d/3: rate limited, waiting %.1fs", attempt, delay)
                        await asyncio.sleep(delay)
                        continue
                    raise last_error
            except GroqError:
                raise
            except httpx.HTTPError as exc:
                last_error = exc
            if attempt < 3:
                log.warning("[groq] attempt %d/3 failed: %s", attempt, last_error)
                await asyncio.sleep(attempt * 2)
        raise GroqError(str(last_error))

    async def close(self) -> None:
        await self._client.aclose()
