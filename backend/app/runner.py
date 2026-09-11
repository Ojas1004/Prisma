"""The job runner — executes transform jobs as asyncio tasks. One job =
resolve the source once, then generate every selected output type
sequentially (deliberate: parallel calls punish the Groq free-tier rate
limit). A failed type is recorded on its artifact (`error`) and the job
still completes if at least one type succeeds."""

import asyncio
import logging
from dataclasses import replace

from app import chunking, config, db, digest, sources
from app.generators import Generator, Progress, Request
from app.models import Artifact, Bundle, SSEEvent, Transform
from app.sse import hub

log = logging.getLogger("runner")

# Sequential generation of up to 7 types, each with LLM retries, needs room.
JOB_TIMEOUT_SECONDS = 900


class Runner:
    def __init__(self, registry: dict[str, Generator], model: str, client=None) -> None:
        self.registry = registry
        self.model = model
        # The map step calls Groq directly (not through a generator), so the
        # runner needs the client. Falls back to any generator's client so
        # existing construction sites keep working.
        self.client = client or next(iter(registry.values())).client
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

        # ── Single-call fast path vs map/reduce ───────────────────────────
        # sources.resolve() had to decide with a chars/4 estimate because it
        # runs in a thread and cannot await. Here we can, so re-check the
        # borderline case against the provider's REAL tokenizer: a source the
        # estimate called oversized may actually fit one context window, and
        # chunking it would spend N+1 extra requests for nothing.
        #
        # Only ever cancels chunking, never introduces it — if the real count
        # is at or above the threshold, or counting is unsupported/fails, the
        # existing plan stands untouched.
        if resolved.chunk_plan and resolved.chunk_plan.chunked:
            try:
                real_tokens = await self.client.count_tokens(resolved.text)
            except Exception as exc:  # noqa: BLE001
                log.info(
                    "[path] token counting unavailable (%s) — keeping the "
                    "estimate-based plan", str(exc)[:120],
                )
            else:
                if real_tokens < chunking.CHUNKING_THRESHOLD_TOKENS:
                    log.info(
                        "[path] FAST PATH (single call): %d real tokens < %d threshold "
                        "— skipping map-reduce (estimate had said %d tokens, %d chunks)",
                        real_tokens, chunking.CHUNKING_THRESHOLD_TOKENS,
                        resolved.chunk_plan.total_tokens, resolved.chunk_plan.count,
                    )
                    resolved = replace(resolved, chunk_plan=None)
                else:
                    log.info(
                        "[path] MAP-REDUCE: %d real tokens >= %d threshold — "
                        "chunking into %d pieces",
                        real_tokens, chunking.CHUNKING_THRESHOLD_TOKENS,
                        resolved.chunk_plan.count,
                    )
        elif resolved.text:
            log.info(
                "[path] FAST PATH (single call): source fit one context window "
                "at ingestion (~%d estimated tokens) — no chunking",
                resolved.chunk_plan.total_tokens if resolved.chunk_plan else 0,
            )

        # ── Chunk + map/reduce (ONCE per source, not per deliverable) ─────
        # A multi-select job maps the document a single time here; every
        # deliverable below then generates from the same reduced digest.
        chunk_count = 0
        if resolved.chunk_plan and resolved.chunk_plan.chunked:
            plan = resolved.chunk_plan
            chunk_count = plan.count
            await progress(
                "chunking",
                f"Document is large (~{plan.total_tokens:,} tokens) — "
                f"chunked into {plan.count} pieces",
            )
            try:
                digest_text = await digest.build_digest(self.client, plan, progress)
            except Exception as exc:  # noqa: BLE001
                await self._fail(transform_id, "chunking", str(exc))
                return
            resolved = replace(resolved, text=digest_text)
            await progress(
                "chunking",
                f"Chunk extraction complete — {plan.count} summaries reduced for generation",
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
                # Same digest served every deliverable in this job — the
                # count is recorded per artifact so the UI can show it.
                artifact.source_chunks = chunk_count
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
