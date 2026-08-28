"""The job runner — executes transform jobs as asyncio tasks. One job =
resolve the source once, then generate every selected output type
sequentially (deliberate: parallel calls punish the Groq free-tier rate
limit). A failed type is recorded on its artifact (`error`) and the job
still completes if at least one type succeeds."""

import asyncio
import logging

from app import config, db, sources
from app.generators import Generator, Progress, Request
from app.models import Artifact, Bundle, SSEEvent, Transform
from app.sse import hub

log = logging.getLogger("runner")

# Sequential generation of up to 7 types, each with LLM retries, needs room.
JOB_TIMEOUT_SECONDS = 900


class Runner:
    def __init__(self, registry: dict[str, Generator], model: str) -> None:
        self.registry = registry
        self.model = model
        self._tasks: set[asyncio.Task] = set()

    def start(self, transform_id: str, retry_types: list[str] | None = None) -> None:
        """Launch the job in the background and return immediately.
        retry_types narrows a retry to a subset of the row's output_types."""
        task = asyncio.create_task(self._run_safe(transform_id, retry_types or []))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _run_safe(self, transform_id: str, retry_types: list[str]) -> None:
        try:
            await asyncio.wait_for(
                self._run(transform_id, retry_types),
                timeout=JOB_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            await self._fail(transform_id, "pipeline", "generation timed out")
        except Exception as exc:  # noqa: BLE001 — job boundary: everything becomes a failed row
            await self._fail(transform_id, "pipeline", str(exc))

    @staticmethod
    def _plan(t: Transform, retry_types: list[str]) -> tuple[list[str], dict[str, Artifact]]:
        """Decide which types to (re)generate and which prior artifacts to
        keep. Fresh run → everything. Retry with a subset → exactly that
        subset. Bare retry → failed/missing types, or everything when the
        whole bundle already succeeded."""
        prior_ok = {
            a.output_type: a
            for a in (t.content.artifacts if t.content else [])
            if a.output_type and not a.error
        }
        if retry_types:
            to_run = retry_types
        else:
            failed_or_missing = [ot for ot in t.output_types if ot not in prior_ok]
            to_run = failed_or_missing or list(t.output_types)
        kept = {ot: a for ot, a in prior_ok.items() if ot not in to_run}
        return to_run, kept

    async def _run(self, transform_id: str, retry_types: list[str]) -> None:
        t = await db.get_transform(transform_id)
        if t is None:
            log.error("[transform][%s] row disappeared", transform_id)
            return

        unknown = [ot for ot in t.output_types if ot not in self.registry]
        if unknown:
            await self._fail(transform_id, "pipeline", f"no generator registered for output types {unknown!r}")
            return

        to_run, results = self._plan(t, retry_types)

        async def progress(step: str, message: str, output_type: str = "") -> None:
            await db.update_stage(transform_id, step)
            hub.publish(
                transform_id,
                SSEEvent(step=step, status="processing", message=message, output_type=output_type),
            )

        # ── Resolve source (once for the whole bundle) ────────────────────
        await progress("reading_source", "Reading source content...")
        try:
            source_path = await db.get_source_path(transform_id)
            resolved = await asyncio.to_thread(
                sources.resolve, t.source_kind, t.source_text, source_path
            )
        except Exception as exc:  # noqa: BLE001
            await self._fail(transform_id, "reading_source", str(exc))
            return

        if resolved.truncated_from:
            await progress(
                "reading_source",
                f"Source trimmed to fit the model budget "
                f"({len(resolved.text):,} of {resolved.truncated_from:,} characters used)",
            )

        # ── Generate each selected type ───────────────────────────────────
        for i, ot in enumerate(to_run, 1):
            generator = self.registry[ot]
            label = generator.output_type.label
            step = f"generating:{ot}"
            await progress(step, f"Generating {label} ({i}/{len(to_run)})...", ot)

            def type_progress(ot: str = ot) -> Progress:
                async def p(sub_step: str, message: str) -> None:
                    await progress(f"{sub_step}:{ot}", message, ot)
                return p

            try:
                output = await generator.generate(
                    Request(source=resolved, options=t.options), type_progress()
                )
                artifact = output.artifact
                artifact.output_type = ot
                for path_field, (payload, extension) in output.files.items():
                    rel_path = f"artifacts/{transform_id}-{ot}{extension}"
                    (config.DATA_DIR / "artifacts").mkdir(parents=True, exist_ok=True)
                    (config.DATA_DIR / rel_path).write_bytes(payload)
                    setattr(artifact, path_field, rel_path)
                results[ot] = artifact
                hub.publish(
                    transform_id,
                    SSEEvent(step=step, status="completed", message=f"{label} complete", output_type=ot),
                )
            except Exception as exc:  # noqa: BLE001 — per-type boundary: record and move on
                log.error("[transform][%s] %s failed: %s", transform_id, ot, exc)
                results[ot] = Artifact(output_type=ot, error=str(exc))
                hub.publish(
                    transform_id,
                    SSEEvent(step=step, status="failed", message=str(exc), output_type=ot),
                )

        # ── Persist the bundle ────────────────────────────────────────────
        await progress("saving", "Saving deliverables...")
        bundle = Bundle(artifacts=[results[ot] for ot in t.output_types if ot in results])
        succeeded = [a for a in bundle.artifacts if not a.error]

        if not succeeded:
            await db.update_bundle(transform_id, bundle)
            first_error = bundle.artifacts[0].error if bundle.artifacts else "nothing generated"
            await self._fail(transform_id, "pipeline", f"all output types failed — first error: {first_error}")
            return

        await db.complete_transform(transform_id, bundle)
        hub.publish(
            transform_id,
            SSEEvent(
                step="pipeline",
                status="completed",
                message=f"{len(succeeded)}/{len(bundle.artifacts)} deliverables ready",
            ),
        )
        log.info(
            "[transform][%s] completed: %d/%d types ok (%s)",
            transform_id, len(succeeded), len(bundle.artifacts), ",".join(t.output_types),
        )

    async def _fail(self, transform_id: str, step: str, message: str) -> None:
        """Job-level failure — the published event carries no output_type,
        which is what makes it terminal for SSE consumers."""
        log.error("[transform][%s] %s failed: %s", transform_id, step, message)
        try:
            await db.fail_transform(transform_id, message)
        except Exception:  # noqa: BLE001 — DB down: the SSE event is all we can do
            log.exception("[transform][%s] could not persist failure", transform_id)
        hub.publish(transform_id, SSEEvent(step=step, status="failed", message=message))
