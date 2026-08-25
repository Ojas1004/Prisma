"""Groq API client (api.groq.com). The API is OpenAI-compatible chat
completions — text-inference only, no image generation endpoint. Vision (image
input) requires a multimodal model, so the client auto-selects the configured
vision model whenever a message carries image parts."""

import asyncio
import base64
import logging

import httpx

from app import config

log = logging.getLogger("llm")


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
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        data = await self._post("/chat/completions", payload)
        choices = data.get("choices") or []
        content = choices[0].get("message", {}).get("content", "") if choices else ""
        if not content:
            raise GroqError(f"empty response from {payload['model']}")
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
                # 4xx other than 429 won't heal on retry.
                if resp.status_code != 429 and resp.status_code < 500:
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
