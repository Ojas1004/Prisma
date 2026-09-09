"""Postgres access — raw SQL over an asyncpg pool (SARAL's plain-SQL style)."""

import json
import uuid

import asyncpg

from app import config
from app.models import Bundle, Options, SavedSource, Transform

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(config.DATABASE_URL, min_size=1, max_size=10)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    assert _pool is not None, "db pool not initialized"
    return _pool


SELECT_COLUMNS = """
    id, source_kind, source_title, source_path, source_text,
    output_types, options, content, status, stage,
    error_message, model, created_at, updated_at
"""


def _row_to_transform(row: asyncpg.Record, truncate_source: bool = False) -> Transform:
    options = Options(**json.loads(row["options"])) if row["options"] else Options()
    content = Bundle(**json.loads(row["content"])) if row["content"] else None
    source_text = row["source_text"] or ""
    if truncate_source and len(source_text) > 280:
        source_text = source_text[:280] + "…"
    return Transform(
        id=str(row["id"]),
        source_kind=row["source_kind"],
        source_title=row["source_title"] or "",
        source_text=source_text,
        output_types=json.loads(row["output_types"]),
        options=options,
        content=content,
        status=row["status"],
        stage=row["stage"] or "",
        error_message=row["error_message"] or "",
        model=row["model"] or "",
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def insert_transform(
    source_kind: str,
    source_title: str,
    source_path: str,
    source_text: str,
    output_types: list[str],
    options: Options,
    model: str,
) -> str:
    row = await pool().fetchrow(
        """
        INSERT INTO transforms (source_kind, source_title, source_path, source_text,
                                output_types, options, status, stage, model)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'processing', 'queued', $7)
        RETURNING id
        """,
        source_kind, source_title, source_path, source_text,
        json.dumps(output_types), options.model_dump_json(), model,
    )
    return str(row["id"])


def _parse_id(transform_id: str) -> uuid.UUID | None:
    """URL ids arrive as raw strings; a malformed one is 'not found', not a 500."""
    try:
        return uuid.UUID(transform_id)
    except ValueError:
        return None


async def get_transform(transform_id: str) -> Transform | None:
    tid = _parse_id(transform_id)
    if tid is None:
        return None
    row = await pool().fetchrow(
        f"SELECT {SELECT_COLUMNS} FROM transforms WHERE id = $1", tid
    )
    return _row_to_transform(row) if row else None


async def get_source_path(transform_id: str) -> str:
    """source_path is deliberately not on the API model — fetched separately."""
    value = await pool().fetchval(
        "SELECT source_path FROM transforms WHERE id = $1", transform_id
    )
    return value or ""


async def list_transforms() -> list[Transform]:
    rows = await pool().fetch(
        f"SELECT {SELECT_COLUMNS} FROM transforms ORDER BY created_at DESC"
    )
    return [_row_to_transform(r, truncate_source=True) for r in rows]


async def update_stage(transform_id: str, stage: str) -> None:
    await pool().execute(
        "UPDATE transforms SET stage = $1, updated_at = NOW() WHERE id = $2",
        stage, transform_id,
    )


async def complete_transform(transform_id: str, bundle: Bundle) -> None:
    await pool().execute(
        """
        UPDATE transforms
        SET status = 'completed', stage = 'done', content = $1::jsonb,
            error_message = '', updated_at = NOW()
        WHERE id = $2
        """,
        bundle.model_dump_json(), transform_id,
    )


async def fail_transform(transform_id: str, error_message: str) -> None:
    await pool().execute(
        "UPDATE transforms SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2",
        error_message, transform_id,
    )


async def reset_for_retry(transform_id: str) -> None:
    await pool().execute(
        """
        UPDATE transforms
        SET status = 'processing', stage = 'queued', error_message = '', updated_at = NOW()
        WHERE id = $1
        """,
        transform_id,
    )


async def update_bundle(transform_id: str, bundle: Bundle) -> None:
    await pool().execute(
        "UPDATE transforms SET content = $1::jsonb, updated_at = NOW() WHERE id = $2",
        bundle.model_dump_json(), transform_id,
    )


async def update_output_types(transform_id: str, output_types: list[str]) -> None:
    await pool().execute(
        "UPDATE transforms SET output_types = $1::jsonb, updated_at = NOW() WHERE id = $2",
        json.dumps(output_types), transform_id,
    )


async def delete_transform(transform_id: str) -> None:
    await pool().execute("DELETE FROM transforms WHERE id = $1", transform_id)


# ── Per-user saved sources ────────────────────────────────────────────────────
# user_id is the Supabase auth uuid; identity lives in Supabase, so it is stored
# here as an opaque value with no foreign key. Every query filters on it — a
# missing user_id predicate would leak one operator's sources to another.

SOURCE_COLUMNS = "id, user_id, title, source_type, content_text, size_bytes, created_at"


def _row_to_source(row: asyncpg.Record) -> SavedSource:
    return SavedSource(
        id=str(row["id"]),
        title=row["title"],
        source_type=row["source_type"],
        content_text=row["content_text"],
        size_bytes=row["size_bytes"] or 0,
        created_at=row["created_at"],
    )


async def list_sources(user_id: str) -> list[SavedSource]:
    rows = await pool().fetch(
        f"SELECT {SOURCE_COLUMNS} FROM sources WHERE user_id = $1 ORDER BY created_at DESC",
        uuid.UUID(user_id),
    )
    return [_row_to_source(r) for r in rows]


async def insert_source(
    user_id: str, title: str, source_type: str, content_text: str
) -> SavedSource:
    """size_bytes is computed here from the stored text — never taken from the
    client, which could under-report it."""
    row = await pool().fetchrow(
        """
        INSERT INTO sources (user_id, title, source_type, content_text, size_bytes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING """ + SOURCE_COLUMNS,
        uuid.UUID(user_id), title, source_type, content_text,
        len(content_text.encode("utf-8")),
    )
    return _row_to_source(row)


async def delete_source(source_id: str, user_id: str) -> bool:
    """Ownership is enforced in the WHERE clause rather than by a read-then-check,
    so another user's row can never be deleted even under a race. Returns False
    when nothing matched — caller reports that as 404, not 403, so the response
    cannot confirm that someone else's source id exists."""
    sid = _parse_id(source_id)
    if sid is None:
        return False
    result = await pool().execute(
        "DELETE FROM sources WHERE id = $1 AND user_id = $2", sid, uuid.UUID(user_id)
    )
    return result != "DELETE 0"
