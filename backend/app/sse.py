"""In-process SSE hub — per-transform pub/sub over asyncio queues. Plays the
role SARAL's Redis-backed SSE manager plays, without the extra moving part."""

import asyncio
from collections import defaultdict

from app.models import SSEEvent


class Hub:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue[SSEEvent]]] = defaultdict(set)

    def subscribe(self, transform_id: str) -> asyncio.Queue[SSEEvent]:
        queue: asyncio.Queue[SSEEvent] = asyncio.Queue(maxsize=32)
        self._subs[transform_id].add(queue)
        return queue

    def unsubscribe(self, transform_id: str, queue: asyncio.Queue[SSEEvent]) -> None:
        self._subs[transform_id].discard(queue)
        if not self._subs[transform_id]:
            self._subs.pop(transform_id, None)

    def publish(self, transform_id: str, event: SSEEvent) -> None:
        """Fan out to every listener; slow listeners are skipped rather than
        blocking the pipeline."""
        for queue in list(self._subs.get(transform_id, ())):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass


hub = Hub()
