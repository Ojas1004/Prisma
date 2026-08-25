# SIH Transform — Project Context Document

> **Read this first.** This file is the single source of truth for this project.
> It is written so that a brand-new contributor or AI session, with zero prior
> context, can understand the entire project from this document alone.

---

## 1. PROJECT OVERVIEW

### What this is

A **Smart India Hackathon (SIH) 2026** submission for **Problem Statement ID
26154 — "Gen AI Platform for Automated Content Transformation"**, posed by the
**National Technical Research Organisation (NTRO)**. Category: Software.
Theme: Smart Automation.

An operator submits source content (pasted text, a free-form prompt, a
PDF/TXT/MD document, or an image), selects one or more output deliverable
types, tunes generation parameters, and receives AI-generated,
ready-to-publish communication deliverables to review, edit, and export.

### Where it lives

This project is entirely contained in the **`SIH/` directory**. The
surrounding repository (SARAL — a research-paper-to-media platform by IIIT
Hyderabad) is **reference material only and must never be modified**. It was
used to study architecture conventions; the SIH project shares no code with it.
If your working directory contains `backend/gateway` (Go) or
`frontend/app` (Next.js), you are looking at SARAL, not this project — go to
`SIH/`.

### Original problem statement

Verbatim text from the SIH portal (from the problem statement page; the
portal screenshot was truncated mid-description — text marked [TRUNCATED] was
not captured and should be pasted in from the portal when available):

> **Background:** Organisations frequently need to convert information
> available in different forms such as news articles, reports, advisories,
> threat intelligence, policy documents, research papers, announcements,
> incident reports or free-form prompts into specific communication artefacts
> suitable for various purposes. The process of manually analysing the source
> content, understanding the desired objective and creating the required
> output format is time-consuming, resource-intensive and often requires
> expertise in content creation, communication and domain knowledge.
>
> There is a need for an intelligent platform that can transform user-provided
> content into a desired output format through a simple and configurable
> interface.
>
> **Description:** The system shall act as an AI-powered content
> transformation engine that converts a common source of information into the
> specific deliverable requested by the operator, thereby reducing manual
> effort, improving consistency, accelerating content creation and enhancing
> operational efficiency.
>
> The platform shall provide a dashboard through which an operator can submit
> source content in the form of high quality English language text, documents,
> articles, reports, prompts, images, videos or [TRUNCATED — remainder of the
> official description not captured]

The problem statement's own output-type examples (as relayed by the project
owner — these define the required deliverables, and **every one is a TEXT
deliverable**):

| Spec output type | What the spec expects |
|---|---|
| Video | script, storyboard, scene descriptions, narration text, subtitles, visual recommendations — all text |
| LinkedIn Post | publication-ready post text |
| Twitter/X Post | tweet or thread text |
| Advisory | structured advisory document text |
| Infographic | infographic content, layout recommendations, key messaging — text for a designer |
| Executive Summary | concise briefing text |
| Presentation | slide content and speaker notes — text |

---

## 2. CORE ARCHITECTURE DECISION (and why)

**All 7 output types are text deliverables.** This is not an implementation
shortcut — it is what the problem statement's own examples ask for. "Video"
means a production package a video team can shoot from (script, storyboard,
narration, subtitles), not a rendered MP4. "Infographic" means designer-ready
content and layout recommendations, not a rendered image. Read the table above
before assuming any output type needs media generation.

**Consequence: the core pipeline runs entirely on the Groq API free tier.
Zero paid dependency is required for spec compliance.** This is a hard budget
constraint from the project owner, not a preference.

**The optional visual layer is deliberately separate.** Files
`image_generator.py` and `video_generator.py` (planned, see §8) form an
optional enhancement layer that can render actual images/videos from a
finished text deliverable. This layer is:

- **Gemini-gated:** active only when `GEMINI_API_KEY` is set AND
  `ENABLE_VISUAL_LAYER=true`. Both default to unset/false.
- **Never wired into the 7 core output types or the core dispatcher.** In the
  UI it appears only as a "Generate visual" action on an already-produced text
  deliverable, disabled with a "requires Gemini key" note when off.

**Do not "helpfully" merge the visual layer into the core registry or
dispatcher.** The separation is the point: judges must be able to run the full
spec-required demo with only a free Groq key, and the visual layer must be
able to fail, be removed, or stay unconfigured without touching any
spec-required behavior.

---

## 3. TECH STACK (explicit)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **React 19 + Vite 6** (TypeScript, strict) | Plain SPA, no router, no styling library — deliberately minimal; pipeline correctness over visuals |
| Backend | **Python 3.13 + FastAPI** (uvicorn, async throughout) | |
| Database | **PostgreSQL 16** | host port **5434**; plain SQL migration auto-applied on container init; raw SQL via `asyncpg`, no ORM. Run via podman on this machine — see "Running locally" below |
| LLM (core) | **Groq API** — `https://api.groq.com/openai/v1`, OpenAI-compatible | Env: `GROQ_API_KEY` (required), `GROQ_CHAT_MODEL` (default `openai/gpt-oss-120b`), `GROQ_VISION_MODEL` (default `qwen/qwen3.6-27b`, used automatically when a message carries image parts), `GROQ_BASE_URL`. Model catalog moves fast — the original `llama-3.3-70b-versatile` / `llama-4-scout` defaults were retired by Aug 2026; verify against `GET /openai/v1/models` (or console.groq.com/docs/models) if generation 404s with `model_not_found` |
| LLM (optional, disabled) | **Gemini API** for image/video rendering | Env: `GEMINI_API_KEY` + flag `ENABLE_VISUAL_LAYER` (default: off). Not yet implemented — see §8 |
| Jobs | asyncio background tasks, in-process SSE hub | No queue infrastructure |
| Files | Local disk `SIH/backend/data/` (gitignored) | uploads/ and artifacts/ |

**Explicitly NOT in this stack** (earlier iterations used these and were fully
removed — do not reintroduce): **no Go services, no Redis, no Celery, no
Next.js, no xAI/Grok API** (the provider is **Groq** — `api.groq.com` — an
earlier iteration briefly targeted the similarly-named xAI Grok and was
corrected), no Gemini in the core pipeline, no GCS/cloud storage.

API responses all use the envelope `{"success": bool, "data": …, "error": {"code", "message"}}`.

### Running locally (this machine — Fedora, no docker)

The dev machine has **no docker and no compose provider; Postgres runs via the
host's podman** (from inside the VSCodium flatpak sandbox, prefix commands
with `flatpak-spawn --host`). This replicates `docker-compose.yml` exactly —
same container name, port, volume, and init.sql mount (`:z` is the SELinux
label Fedora needs on the bind mount):

```sh
podman run -d --name sih-transform-postgres \
  -e POSTGRES_USER=sih -e POSTGRES_PASSWORD=sih -e POSTGRES_DB=sih_transform \
  -p 5434:5432 \
  -v sih_pgdata:/var/lib/postgresql/data \
  -v ./backend/migrations/init.sql:/docker-entrypoint-initdb.d/init.sql:ro,z \
  docker.io/library/postgres:16-alpine
```

(`podman start sih-transform-postgres` on subsequent boots; docker-compose.yml
still works as-is on machines that have docker or podman-compose.)

Two more environment gotchas: `backend/.env` exists with a real
`GROQ_API_KEY` (gitignored — never commit or copy it into docs), and the
backend venv's script shebangs point to a pre-move path, so launch with
`.venv/bin/python -m uvicorn app.main:app --port 8000`, not `.venv/bin/uvicorn`.

---

## 4. CURRENT FILE STRUCTURE

```
SIH/
├── SPEC.md                          ← this document
├── README.md                        run instructions (compose → backend → frontend)
├── docker-compose.yml               Postgres 16 on host port 5434, mounts init.sql
├── .gitignore                       .env, data/, node_modules, dist, venv, __pycache__
├── backend/
│   ├── requirements.txt             fastapi, uvicorn, asyncpg, httpx, python-dotenv,
│   │                                python-multipart, pypdf
│   ├── .env.example                 GROQ_* vars + DATABASE_URL + CORS_ORIGINS
│   ├── migrations/init.sql          full schema bootstrap (see §5)
│   ├── data/                        runtime files (gitignored): uploads/, artifacts/
│   └── app/
│       ├── main.py                  FastAPI entrypoint: lifespan wires prompts→registry→runner,
│       │                            CORS, includes router. Run: uvicorn app.main:app --port 8000
│       ├── config.py                env vars + prompts.json loader (OutputType/PromptConfig)
│       ├── models.py                pydantic API contracts (see §5)
│       ├── db.py                    asyncpg pool + raw-SQL CRUD for transforms table
│       ├── llm.py                   GroqClient: chat(messages, json_mode); vision model
│       │                            auto-selected for image parts; 3× retry on 429/5xx
│       ├── sources.py               source_kind → ResolvedSource (pdf via pypdf, image bytes)
│       ├── sse.py                   in-process pub/sub hub (dict of asyncio queues)
│       ├── runner.py                background job: resolve source → generate → persist,
│       │                            publishing SSE stage events throughout
│       ├── routes.py                all HTTP routes (see §6)
│       ├── prompts.json             output-type registry + generation parameters (see §7)
│       └── generators/
│           ├── __init__.py          Generator ABC, Kind enum, Request/GenOutput,
│           │                        parse_json_object, build_registry (from prompts.json)
│           ├── text.py              TextGenerator — all 7 core types (to be renamed
│           │                        text_generator.py, see §8)
│           └── image.py             LEGACY Groq-SVG renderer — scheduled for deletion (§8);
│                                    superseded by infographic-as-text + Gemini visual layer
└── frontend/
    ├── package.json                 react, react-dom; vite, typescript (no other deps)
    ├── vite.config.ts               stock @vitejs/plugin-react
    ├── tsconfig.json                strict, bundler resolution
    ├── index.html
    └── src/
        ├── main.tsx                 React root
        ├── App.tsx                  entire UI: source form, output-type select, SSE
        │                            progress, result rendering, retry/delete
        └── lib/
            ├── api.ts               BASE_URL (VITE_API_URL, default localhost:8000),
            │                        envelope-unwrapping request(), EventSource stream
            └── types.ts             TS mirror of models.py contracts
```

---

## 5. DATA MODEL

### Postgres schema (as it exists in `migrations/init.sql` right now)

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE IF NOT EXISTS transforms (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_kind   TEXT NOT NULL,               -- text | prompt | pdf | image
    source_title  TEXT DEFAULT '',
    source_path   TEXT DEFAULT '',             -- uploaded file under data/uploads/
    source_text   TEXT DEFAULT '',             -- pasted / extracted text
    output_type   TEXT NOT NULL,               -- ⚠ single type; multi-select migration pending (§8)
    output_kind   TEXT NOT NULL,               -- text | image — ⚠ to be dropped (§8)
    options       JSONB DEFAULT '{}'::jsonb,
    content       JSONB,                       -- one Artifact; becomes a bundle (§8)
    status        TEXT NOT NULL DEFAULT 'processing',  -- processing | completed | failed
    stage         TEXT DEFAULT '',             -- current stage, replayed on SSE reconnect
    error_message TEXT DEFAULT '',
    model         TEXT DEFAULT '',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transforms_created_at ON transforms(created_at);
```

One row = one submitted job. Dev data is disposable — schema changes are made
by editing `init.sql` and recreating the compose volume, not by incremental
migration files.

### Pydantic models (`app/models.py`, current code)

| Model | Represents |
|---|---|
| `Options` | The 6 generation parameters (per §7), stored as JSONB: `target_audience`, `tone`, `language`, `level_of_detail`, `communication_objective`, `content_style` — keys match prompts.json `parameters` entries |
| `Artifact` | One generated deliverable. Current: `kind` ("text"/"image"), `title`, `body_markdown`, `highlights[]`, `metadata{}`, `image_path`, `image_prompt`. Target (§8): gains `output_type` + `error`, drops `kind`/`image_path`/`image_prompt` from the core (visual layer owns those) |
| `Transform` | Full row surfaced over the API (content nested as `Artifact`) |
| `SSEEvent` | `{step, status: processing|completed|failed, message}` |
| `StartBody` | JSON start request: `source_kind`, `text`, `title`, `output_type`, `options` |
| `UpdateContentBody` | `{content: Artifact}` for operator edits |
| `RetryBody` | `{image_prompt}` (legacy SVG flow; slated for removal) |

---

## 6. API ROUTES (`app/routes.py`, current code)

All under `http://localhost:8000`. Envelope on every JSON response.

| Method + path | Purpose | Request → Response (`data` field) |
|---|---|---|
| `GET /health` | liveness | `{status: "ok"}` |
| `GET /api/output-types` | registry for the frontend picker + parameters form | `{output_types: [{type, kind, label, description}], parameters: [{key, label, kind, placeholder, options[]}]}` |
| `POST /api/transform/start` | create + start a job | JSON `StartBody` (text/prompt) or multipart with `file` + same fields as form strings (`options` as JSON string). → 202 `{id, stream_url, status_url}` |
| `GET /api/transform/list` | history, newest first | `{transforms: [Transform]}` (source_text truncated to 280 chars) |
| `GET /api/transform/{id}` | full row | `Transform` |
| `GET /api/transform/{id}/stream` | SSE progress | `data:` frames of `SSEEvent`; terminal = `status=failed` or `step=pipeline & status=completed`; already-terminal rows replay one frame and close; 15 s keepalive comments |
| `PUT /api/transform/{id}/content` | save operator edits | `UpdateContentBody` → updated `Transform` (409 if not generated yet) |
| `POST /api/transform/{id}/retry` | re-run a finished/failed job | optional `{image_prompt}` → 202 `{id, stream_url}` (409 while running) |
| `GET /api/transform/{id}/export?format=md\|txt` | download deliverable | file attachment built from title/body/highlights |
| `GET /api/transform/{id}/image` | serve generated visual (legacy SVG flow) | image file by extension |
| `DELETE /api/transform/{id}` | delete row + stored files | `{deleted: true}` |

Planned route changes for multi-select (§8): `start` takes `output_types: []`;
`export` gains `&type=<output_type>`; `retry` re-runs only failed types;
`/{id}/visual` appears later as the visual-layer entry point.

Job flow: `start` inserts the row and launches an asyncio task
(`runner.py`). Stages published over SSE and stamped on the row:
`reading_source` → `generating` (target: `generating:<type>` per selected
type) → `saving` → terminal event. Failures set `status=failed` +
`error_message`; retry resets and re-runs the same row.

---

## 7. OUTPUT-TYPE REGISTRY (`app/prompts.json`)

prompts.json is the single place output types and generation parameters are
defined — **adding or re-wording a deliverable type is a JSON edit, zero
code**. Structure:

```jsonc
{
  "system": "…shared preamble for every generation…",
  "parameters": [        // the 6 operator-configurable generation parameters
    {"key": "target_audience", "kind": "text",   "label": …, "placeholder": …,
     "prompt_template": "Target audience: {value}. Calibrate…"},
    {"key": "tone",            "kind": "select", "options": {"formal": "…hint…", "neutral": …, "urgent": …, "conversational": …}},
    {"key": "language",        "kind": "text",   "prompt_template": "Write the entire deliverable in {value}."},
    {"key": "level_of_detail", "kind": "select", "options": {"brief": …, "standard": …, "comprehensive": …}},
    {"key": "communication_objective", "kind": "text", "prompt_template": …},
    {"key": "content_style",   "kind": "select", "options": {"factual": …, "analytical": …, "narrative": …, "persuasive": …}}
  ],
  "types": [             // the 7 core deliverables — ALL text
    {"type": "video",             "label": "Video Package",    "system": …, "instructions": […]},
    {"type": "linkedin_post",     "label": "LinkedIn Post",    …},
    {"type": "twitter_post",      "label": "Twitter/X Post",   …},
    {"type": "advisory",          "label": "Advisory",         …},
    {"type": "infographic",       "label": "Infographic",      …},
    {"type": "executive_summary", "label": "Executive Summary",…},
    {"type": "presentation",      "label": "Presentation",     …}
  ]
}
```

Each type's `instructions` mandate the deliverable's exact structure as `##`
headings the model must emit in `body_markdown` (e.g. `video` requires
`## Script`, `## Storyboard`, `## Scene Descriptions`, `## Narration Text`,
`## Subtitles`, `## Visual Recommendations`; `presentation` requires
`## Slide N: <title>` blocks with `On slide:` bullets + `Speaker notes:`).

**Parameter injection:** the generator builds a GENERATION PARAMETERS block —
for `select` params it looks up the chosen option's hint text; for `text`
params it fills `{value}` into the param's `prompt_template`. Empty params are
omitted. This block + the type's system/instructions + the JSON output schema
+ the framed source material form the single user prompt sent to Groq with
`response_format: json_object`. The model returns
`{title, body_markdown, highlights, metadata}` which is validated into
`Artifact`.

Sources are normalized first (`sources.py`): `text`/`prompt` verbatim (prompt
framed as "the operator's brief IS the task"), `pdf` text-extracted with
pypdf, `image` attached as a data-URI part (Groq vision model auto-selected).

---

## 8. WHAT'S DONE vs WHAT'S NOT

### Done and verified

- [x] FastAPI backend skeleton: config, models, db (asyncpg), llm (Groq),
      sources, sse hub, runner, routes, main — imports verified, frontend
      `npm run build` passes
- [x] Postgres compose + init.sql (single-type schema)
- [x] Groq client with vision auto-selection and 429/5xx retry
- [x] Single-type end-to-end flow (old registry): start → SSE → artifact →
      retry/delete — **code-complete but never run against live Groq/Postgres**
      (the dev machine for this work had no Docker and no API key)
- [x] Minimal React frontend: submit (text/prompt/pdf/image), type dropdown
      from the API, SSE progress, text/image result rendering, retry, delete
- [x] prompts.json rewritten to the 7 spec-aligned text types + 6 generation
      parameters (§7)
- [x] This context document
- [x] **Startup fixed (was item 1):** `config.py` parses the new prompts.json
      (`Parameter` dataclass, `OutputType.kind` optional defaulting `"text"` —
      field removal itself waits on Tasks 3-4, which drop the `output_kind`
      column and `image.py`); backend starts cleanly, verified live
- [x] **Parameters (was Task 2):** `Options` → the 6 §7 fields;
      `Generator.parameters_block()` does parameter-injection per §7 (select →
      hint text, text → `prompt_template`, empty omitted, unknown select
      values pass through verbatim); `GET /api/output-types` now also returns
      `parameters` so the frontend form can be data-driven; `types.ts`/`api.ts`
      mirrors updated (no frontend form UI yet — that's frontend work in
      Task 3)
- [x] **First live end-to-end run (against real Groq + podman Postgres):**
      twitter_post with parameters set — generation honors them. Groq's
      catalog had retired both old model defaults; defaults now
      `openai/gpt-oss-120b` (chat) + `qwen/qwen3.6-27b` (vision, verified
      accepting image parts)

### Not done — pending work, in order

3. **Multi-select bundles (Task 3):** `output_types: []` on start; runner
   resolves source once, loops selected types sequentially with
   `generating:<type>` SSE steps; `content = {"artifacts": [...]}`; per-type
   failure recorded on the artifact (`error`), job completes if ≥1 succeeds;
   retry re-runs only failed/missing types; schema change (`output_types
   JSONB`, drop `output_kind`); export gains `?type=`; frontend: checkboxes +
   bundle rendering.
4. **File split (Task 4 prep):** rename `generators/text.py` →
   `text_generator.py`; **delete** `generators/image.py` (legacy Groq-SVG
   renderer, superseded by infographic-as-text — deletion proposed, owner
   confirmation pending; alternative on the table: keep it as a no-key
   fallback inside the visual layer); strip
   `image_path`/`image_prompt`/`kind` from the core `Artifact`.
5. **Optional visual layer (Task 4):** create `image_generator.py` +
   `video_generator.py` as Gemini-gated stubs (`GEMINI_API_KEY` +
   `ENABLE_VISUAL_LAYER=true`); "Generate visual" UI action on finished
   deliverables, disabled with "requires Gemini key" note; future
   `POST /api/transform/{id}/visual`.
6. **Docs:** update README (7 types, parameters, multi-select) and §§4-6 of
   this file after the above lands.
7. **Live end-to-end test** with a real `GROQ_API_KEY` and Docker Postgres —
   never yet performed anywhere.
8. Deferred (post-core): edit UI for bundles, export DOCX/PDF, URL ingestion,
   history view polish, auth.

### Known stale spots (fix during items 3-4, don't be confused by them)

- `routes.py`/`App.tsx` still single-type (`output_type` string); `App.tsx`
  has no generation-parameters form yet (the API already serves the
  definitions for it).
- `OutputType.kind` / `output_kind` / `Kind` dispatch still exist as legacy
  plumbing until the Task 3 schema change and Task 4 `image.py` deletion.
- README still says "5 text types + 1 image type" era wording in places.

---

## 9. KNOWN CONSTRAINTS / DECISIONS — DO NOT RELITIGATE

1. **No paid APIs in the core pipeline.** Budget constraint. Core = Groq free
   tier only. Gemini appears ONLY behind the disabled-by-default visual layer.
2. **The LLM provider is Groq (api.groq.com), NOT xAI's Grok.** This was
   explicitly corrected once. Env var is `GROQ_API_KEY`.
3. **All 7 core output types are text.** Per the problem statement's own
   examples. Do not turn "Video" or "Infographic" into media-generation
   features in the core.
4. **Multi-select output types are required by the spec** — one submission,
   many deliverables, returned as a bundle. Not separate jobs per type.
5. **The visual layer stays out of the core dispatcher/registry** — separate
   files, separate flag, separate UI action. See §2 for why.
6. **Stack is settled:** React+Vite / FastAPI / PostgreSQL / Groq. Earlier
   Go+Redis and Next.js iterations were deliberately discarded. The SARAL repo
   around `SIH/` is reference-only — never modify it.
7. **Frontend stays deliberately plain** until the pipeline is proven
   end-to-end — no styling libraries, no routing. Priority is the working
   loop, not visual design.
8. **prompts.json is the registry.** New deliverable types and parameters are
   JSON edits, not code. Keep it that way.
9. **Postgres access is raw SQL via asyncpg** (no ORM); schema changes go into
   `migrations/init.sql` + volume recreate during dev.
