-- SIH Transform — full bootstrap schema. Mounted into the Postgres container
-- by docker-compose.yml, so a fresh `docker compose up` gives a ready DB.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS transforms (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_kind   TEXT NOT NULL,               -- text | prompt | pdf | image
    source_title  TEXT DEFAULT '',
    source_path   TEXT DEFAULT '',             -- uploaded file under data/uploads/
    source_text   TEXT DEFAULT '',             -- pasted / extracted text
    output_type   TEXT NOT NULL,
    output_kind   TEXT NOT NULL,               -- text | image  (video later)
    options       JSONB DEFAULT '{}'::jsonb,
    content       JSONB,                       -- kind-discriminated artifact
    status        TEXT NOT NULL DEFAULT 'processing',  -- processing | completed | failed
    stage         TEXT DEFAULT '',             -- current stage, replayed on SSE reconnect
    error_message TEXT DEFAULT '',
    model         TEXT DEFAULT '',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transforms_created_at ON transforms(created_at);
