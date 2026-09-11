"""Per-step timing instrumentation for one transform run.

Every pipeline phase — source ingestion, prompt construction, each API call,
response parsing, output assembly — is wrapped in `step()`, which records
start, end and duration. At the end of a run `log_summary()` prints one table
sorted slowest-first, with each step's share of total pipeline wall time.

Why a context-local registry rather than a global: transforms run
concurrently, so a module-level list would interleave two jobs' steps into one
unreadable table. `contextvars` gives each asyncio task its own recorder, and
child tasks inherit it — which is what makes a step inside a generator (or
inside llm.chat) land in the right run's table without threading a parameter
through every call site.

Wall time vs sum-of-steps: nested steps (an API call inside a deliverable
step) would double-count if summed, so the table reports each step's own
duration and compares it against measured wall time, never against a sum.
"""

import contextvars
import logging
import time
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass, field

log = logging.getLogger("timing")

# The active recorder for this task, if a run is being timed.
_current: contextvars.ContextVar["Recorder | None"] = contextvars.ContextVar(
    "timing_recorder", default=None
)


@dataclass
class Step:
    name: str
    start: float
    end: float = 0.0
    # Depth 0 is a top-level phase; deeper steps are nested inside one (an
    # API call within a deliverable), and are indented in the table so a
    # reader does not mistake a child for a sibling.
    depth: int = 0
    detail: str = ""

    @property
    def duration(self) -> float:
        return (self.end or time.perf_counter()) - self.start


@dataclass
class Recorder:
    label: str = ""
    steps: list[Step] = field(default_factory=list)
    t0: float = field(default_factory=time.perf_counter)
    _depth: int = 0

    def begin(self, name: str, detail: str = "") -> Step:
        s = Step(name=name, start=time.perf_counter(), depth=self._depth, detail=detail)
        self.steps.append(s)
        self._depth += 1
        return s

    def end(self, s: Step) -> None:
        s.end = time.perf_counter()
        self._depth = max(0, self._depth - 1)
        log.info(
            "[timing] %-38s start=%7.2fs end=%7.2fs dur=%7.3fs%s",
            ("  " * s.depth) + s.name,
            s.start - self.t0, s.end - self.t0, s.duration,
            f"  ({s.detail})" if s.detail else "",
        )

    @property
    def wall(self) -> float:
        return time.perf_counter() - self.t0


@contextmanager
def run(label: str = ""):
    """Start timing a run. Installs a Recorder for this task and its children."""
    rec = Recorder(label=label)
    token = _current.set(rec)
    try:
        yield rec
    finally:
        _current.reset(token)


@asynccontextmanager
async def step(name: str, detail: str = ""):
    """Time one pipeline step. A no-op when no run is being timed, so
    instrumented code stays callable outside a timed transform (tests, the
    retry path) without special-casing."""
    rec = _current.get()
    if rec is None:
        yield
        return
    s = rec.begin(name, detail)
    try:
        yield s
    finally:
        rec.end(s)


def annotate(detail: str) -> None:
    """Attach detail to the innermost open step (token counts, model name,
    retry count) once it is known — i.e. after the call it describes."""
    rec = _current.get()
    if rec is None:
        return
    for s in reversed(rec.steps):
        if not s.end:
            s.detail = f"{s.detail}; {detail}" if s.detail else detail
            return


def log_summary(served_by: str = "") -> None:
    """Print the slowest-first table for the active run.

    `served_by` reports which provider actually served each call (from
    provider.FallbackClient.summary()), so fallback frequency is visible right
    next to the timings it explains."""
    rec = _current.get()
    if rec is None or not rec.steps:
        return
    wall = rec.wall
    ranked = sorted(rec.steps, key=lambda s: s.duration, reverse=True)
    width = max(len(s.name) for s in ranked) + 2

    lines = [
        "",
        f"┌─ PIPELINE TIMING{(' — ' + rec.label) if rec.label else ''}",
        f"│  total wall time: {wall:.3f}s   steps recorded: {len(ranked)}",
    ]
    if served_by:
        lines.append(f"│  served by: {served_by}")
    lines += [
        f"│  {'step'.ljust(width)} {'duration':>10} {'% wall':>8}  detail",
        "│  " + "─" * (width + 22),
    ]
    for s in ranked:
        pct = (s.duration / wall * 100) if wall > 0 else 0.0
        lines.append(
            f"│  {s.name.ljust(width)} {s.duration:9.3f}s {pct:7.1f}%  {s.detail}"
        )
    slowest = ranked[0]
    lines.append("│  " + "─" * (width + 22))
    lines.append(
        f"└─ BOTTLENECK: {slowest.name} — {slowest.duration:.3f}s "
        f"({slowest.duration / wall * 100 if wall else 0:.1f}% of wall time)"
    )
    log.info("\n".join(lines))
