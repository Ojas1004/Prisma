"""The job runner — executes transform jobs as asyncio tasks. Generator-
agnostic: any registered Generator (text, image, future video) runs through
the same stages — resolve source → generate → persist."""

import asyncio
import logging

from app import config, db, sources
from app.generators import Generator, Request
from app.models import SSEEvent
from app.sse import hub

log = logging.getLogger("runner")

JOB_TIMEOUT_SECONDS = 600


class Runner:
    def __init__(self, registry: dict[str, Generator], model: str) -> None:
        self.registry = registry
        self.model = model
        self._tasks: set[asyncio.Task] = set()

    def start(self, transform_id: str, image_prompt_override: str = "") -> None:
        """Launch the job in the background and return immediately."""
        task = asyncio.create_task(self._run_safe(transform_id, image_prompt_override))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _run_safe(self, transform_id: str, image_prompt_override: str) -> None:
        try:
            await asyncio.wait_for(
                self._run(transform_id, image_prompt_override),
                timeout=JOB_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            await self._fail(transform_id, "pipeline", "generation timed out")
        except Exception as exc:  # noqa: BLE001 — job boundary: everything becomes a failed row
            await self._fail(transform_id, "pipeline", str(exc))

    async def _run(self, transform_id: str, image_prompt_override: str) -> None:
        t = await db.get_transform(transform_id)
        if t is None:
            log.error("[transform][%s] row disappeared", transform_id)
            return

        generator = self.registry.get(t.output_type)
        if generator is None:
            await self._fail(transform_id, "pipeline", f"no generator registered for output type {t.output_type!r}")
            return

        current_step = "pipeline"

        async def progress(step: str, message: str) -> None:
            nonlocal current_step
            current_step = step
            await db.update_stage(transform_id, step)
            hub.publish(transform_id, SSEEvent(step=step, status="processing", message=message))

        # ── Resolve source ────────────────────────────────────────────────
        await progress("reading_source", "Reading source content...")
        try:
            source_path = await db.get_source_path(transform_id)
            resolved = await asyncio.to_thread(
                sources.resolve, t.source_kind, t.source_text, source_path
            )
        except Exception as exc:  # noqa: BLE001
            await self._fail(transform_id, "reading_source", str(exc))
            return

        # ── Generate ──────────────────────────────────────────────────────
        try:
            output = await generator.generate(
                Request(
                    source=resolved,
                    options=t.options,
                    image_prompt_override=image_prompt_override,
                ),
                progress,
            )
        except Exception as exc:  # noqa: BLE001
            await self._fail(transform_id, current_step, str(exc))
            return

        # ── Persist ───────────────────────────────────────────────────────
        await progress("saving", "Saving artifact...")
        artifact = output.artifact
        artifacts_dir = config.DATA_DIR / "artifacts"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        for path_field, (payload, extension) in output.files.items():
            rel_path = f"artifacts/{transform_id}{extension}"
            (config.DATA_DIR / rel_path).write_bytes(payload)
            setattr(artifact, path_field, rel_path)

        await db.complete_transform(transform_id, artifact)
        hub.publish(
            transform_id,
            SSEEvent(step="pipeline", status="completed", message="Your artifact is ready"),
        )
        log.info("[transform][%s] completed: type=%s kind=%s", transform_id, t.output_type, generator.kind.value)

    async def _fail(self, transform_id: str, step: str, message: str) -> None:
        log.error("[transform][%s] %s failed: %s", transform_id, step, message)
        try:
            await db.fail_transform(transform_id, message)
        except Exception:  # noqa: BLE001 — DB down: the SSE event is all we can do
            log.exception("[transform][%s] could not persist failure", transform_id)
        hub.publish(transform_id, SSEEvent(step=step, status="failed", message=message))
