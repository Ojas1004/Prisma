"""Postgres access — raw SQL over an asyncpg pool (SARAL's plain-SQL style)."""

import json
import uuid

import asyncpg

from app import config
from app.models import Bundle, Options, Transform

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
