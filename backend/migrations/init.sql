-- SIH Transform — full bootstrap schema. Mounted into the Postgres container
-- on init (compose or podman run), so a fresh container gives a ready DB.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS transforms (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_kind   TEXT NOT NULL,               -- text | prompt | pdf | image
    source_title  TEXT DEFAULT '',
    source_path   TEXT DEFAULT '',             -- uploaded file under data/uploads/
    source_text   TEXT DEFAULT '',             -- pasted / extracted text
    output_types  JSONB NOT NULL,              -- ordered list of selected types
    options       JSONB DEFAULT '{}'::jsonb,   -- the 6 generation parameters
    content       JSONB,                       -- bundle: {"artifacts": [...]}
    status        TEXT NOT NULL DEFAULT 'processing',  -- processing | completed | failed
    stage         TEXT DEFAULT '',             -- current stage, replayed on SSE reconnect
    error_message TEXT DEFAULT '',
    model         TEXT DEFAULT '',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transforms_created_at ON transforms(created_at);

-- Per-user saved sources (the left Sources panel). Full content is stored, not
-- just metadata, so a source survives a sign-out without re-upload.
--
-- user_id holds the Supabase auth user's UUID and is deliberately NOT a foreign
-- key: user identity lives in Supabase, not this database, so there is no local
-- users table to reference. It is an opaque reference we filter on.
CREATE TABLE IF NOT EXISTS sources (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL,               -- Supabase auth user id (sub claim)
    title        TEXT NOT NULL,               -- filename or short label
    source_type  TEXT NOT NULL,               -- text | pdf | image (console kinds)
    content_text TEXT NOT NULL,               -- full pasted / extracted content
    size_bytes   INTEGER,                     -- computed server-side from content_text
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every sources query filters by user_id; created_at orders the listing.
CREATE INDEX IF NOT EXISTS idx_sources_user_id ON sources(user_id, created_at DESC);
