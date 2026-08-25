# TERMINAL — Gen AI Platform for Automated Content Transformation

Transform one piece of source material into every communication deliverable you need — in one submission, in seconds.

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-gpt--oss--120b-F55036?logo=groq&logoColor=white)

> **Smart India Hackathon 2026** · Problem Statement **26154** · **National Technical Research Organisation (NTRO)** · Category: Software · Theme: Smart Automation
>
> *"TERMINAL" is a working title — the project name is not yet finalised.*

---

## Overview

Organisations constantly need to turn one source of information — a threat advisory, an incident report, a policy document, a news article — into many different communication artefacts, each with its own format, tone, and audience. Doing that by hand is slow, inconsistent, and demands both domain knowledge and communication expertise.

TERMINAL is an AI-powered content transformation engine that automates that work. An operator submits source content (pasted text, a free-form prompt, a PDF/TXT/MD document, or an image), selects one or more of seven deliverable types, tunes six generation parameters, and receives ready-to-publish deliverables streamed back with live per-type progress.

The entire core pipeline runs on the **Groq API free tier** — there is no paid dependency anywhere in the spec-required feature set.

---

## 1. Key Features

**Seven output types, every one a text deliverable.** The problem statement's own examples define these — "Video" means a production package a team can shoot from, not a rendered MP4; "Infographic" means designer-ready content and layout direction, not a rendered image.

| Output type | What you get |
|---|---|
| `video` | Script with timestamps, storyboard shot list, scene descriptions, narration text, subtitle cues, visual recommendations |
| `linkedin_post` | Publication-ready post: hook, body paragraphs, call to action, hashtags |
| `twitter_post` | A single tweet or a numbered thread, each under 280 characters |
| `advisory` | National-CERT-style advisory: overview, severity, affected systems, technical detail, indicators, recommended actions, references |
| `infographic` | Key messaging, content blocks, layout recommendations, data callouts, design notes |
| `executive_summary` | BLUF paragraph, background, key findings, implications, recommended actions |
| `presentation` | Slide-by-slide content with speaker notes and visual cues |

**Multi-select bundles.** Select any combination of types in a single submission. The source is read once, then each deliverable is generated from it and returned as one bundle — not as separate jobs.

**Six generation parameters.** Every deliverable is tuned by the same operator-configurable knobs:

| Parameter | Kind | Values |
|---|---|---|
| `target_audience` | free text | e.g. "senior decision-makers", "technical analysts" |
| `tone` | select | `formal` · `neutral` · `urgent` · `conversational` |
| `language` | free text | e.g. "English", "Hindi" |
| `level_of_detail` | select | `brief` · `standard` · `comprehensive` |
| `communication_objective` | free text | e.g. "warn operators about an active threat" |
| `content_style` | select | `factual` · `analytical` · `narrative` · `persuasive` |

**Real-time progress over SSE.** Each deliverable reports its own stage on a single event stream, so a seven-type job shows genuine per-type progress rather than one opaque spinner.

**Graceful partial failure.** If one output type fails, the others still complete and return. The failure is recorded on that deliverable alone, and it can be retried on its own without regenerating anything else.

**Four source kinds.** Pasted text, a free-form prompt (the brief itself becomes the task), a PDF/TXT/MD upload (text extracted with `pypdf`), or an image (routed automatically to a vision model).

**Configuration over code.** Output types and generation parameters live entirely in [`backend/app/prompts.json`](backend/app/prompts.json). Adding or rewording a deliverable type is a JSON edit with no code changes.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | **React 19 + Vite 6**, TypeScript (strict) | Single-page app, no router, no styling or animation libraries. The "Terminal CLI" design system is hand-rolled CSS |
| Backend | **Python 3.13 + FastAPI**, uvicorn | Async throughout; background jobs via `asyncio` tasks |
| Database | **PostgreSQL 16** | Raw SQL via `asyncpg`, no ORM. Host port **5434** |
| LLM (text) | **Groq API** — `openai/gpt-oss-120b` | OpenAI-compatible chat completions, JSON mode |
| LLM (vision) | **Groq API** — `qwen/qwen3.6-27b` | Selected automatically when a message carries an image |
| Progress | Server-Sent Events, in-process pub/sub hub | No queue or broker infrastructure |
| Container runtime | **Podman** (or Docker) | Local PostgreSQL only |

**Deliberately not used:** no Redis, no Celery, no Go services, no Next.js, no ORM, no cloud storage, and no paid API anywhere in the core pipeline.

---

## 3. Project Structure

```
.
├── README.md                       this file
├── SPEC.md                         architecture, decisions, and current state — the source of truth
├── docker-compose.yml              PostgreSQL 16 on host port 5434 (see §6 for the Podman equivalent)
│
├── backend/
│   ├── requirements.txt            fastapi, uvicorn, asyncpg, httpx, python-dotenv, python-multipart, pypdf
│   ├── .env.example                template for the environment variables in §5
│   ├── migrations/
│   │   └── init.sql                full schema bootstrap, auto-applied on container init
│   └── app/
│       ├── main.py                 FastAPI entrypoint; lifespan wires prompts → registry → runner
│       ├── config.py               environment variables + prompts.json loader
│       ├── models.py               Pydantic API contracts (Options, Artifact, Bundle, Transform, SSEEvent)
│       ├── routes.py               all HTTP routes and the SSE stream
│       ├── runner.py               background job runner: resolve source once, generate each type
│       ├── llm.py                  Groq client: retries, rate-limit backoff, token-budget guards
│       ├── sources.py              source resolution (text / prompt / PDF / image)
│       ├── db.py                   asyncpg pool and raw-SQL access
│       ├── sse.py                  in-process pub/sub hub for progress events
│       ├── prompts.json            output-type + parameter registry — edit this to add a deliverable
│       └── generators/
│           ├── __init__.py         Generator base class, registry builder, parameter injection
│           ├── text.py             TextGenerator — serves all seven output types
│           └── image.py            legacy SVG renderer, superseded and scheduled for removal
│
└── frontend/
    ├── package.json                react, react-dom, @fontsource/jetbrains-mono; vite, typescript
    ├── vite.config.ts
    ├── tsconfig.json               strict, ES2022, bundler resolution
    ├── index.html
    └── src/
        ├── main.tsx                React root; imports fonts and the design system
        ├── App.tsx                 state-based view switch (home ⇄ transform)
        ├── styles/
        │   └── terminal.css        design tokens, global element styles, animations
        ├── components/
        │   └── Typewriter.tsx      typewriter hero effect with blinking cursor
        ├── pages/
        │   ├── Home.tsx            landing page: hero, live engine status, output registry
        │   └── Transform.tsx       the operator console: type selection, parameters, results
        └── lib/
            ├── api.ts              API client and EventSource wrapper
            └── types.ts            TypeScript mirror of the backend contracts
```

Runtime files live in `backend/data/` (`uploads/` and `artifacts/`) and are gitignored.

---

## 4. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | **3.13+** | Verified on 3.13.14 |
| Node.js | **20+** | Verified on 22.23.2 |
| npm | **10+** | Ships with Node |
| Podman *or* Docker | Podman 5.x / Docker 24+ | For the local PostgreSQL container only |
| Groq API key | — | Free at [console.groq.com](https://console.groq.com) |

A PostgreSQL **client** is optional — useful for inspecting the database, but the server itself runs in the container.

---

## 5. Setup

### 5.1 Clone and enter the project

```bash
git clone https://github.com/Ojas1004/SaralAI-Clone-For-SIH.git
cd SaralAI-Clone-For-SIH
```

All paths below are relative to this repository root.

### 5.2 Configure the backend environment

```bash
cd backend
cp .env.example .env
```

Open `.env` and set your Groq API key. **The backend will not start without a non-empty `GROQ_API_KEY`.**

```ini
# Required — get one free at console.groq.com
GROQ_API_KEY=gsk_your_key_here

# Required — matches the container in §5.3
DATABASE_URL=postgresql://sih:sih@localhost:5434/sih_transform
```

Full environment variable reference:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GROQ_API_KEY` | **Yes** | — | Groq API credentials. Startup fails if unset |
| `DATABASE_URL` | No | `postgresql://sih:sih@localhost:5434/sih_transform` | PostgreSQL connection string |
| `GROQ_BASE_URL` | No | `https://api.groq.com/openai/v1` | API endpoint |
| `GROQ_CHAT_MODEL` | No | `openai/gpt-oss-120b` | Text generation model |
| `GROQ_VISION_MODEL` | No | `qwen/qwen3.6-27b` | Used automatically for image sources |
| `GROQ_MAX_TOKENS` | No | `8000` | Completion budget per deliverable |
| `GROQ_REASONING_EFFORT` | No | `low` | `low` · `medium` · `high` — see the note below |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |
| `DATA_DIR` | No | `backend/data` | Where uploads and artifacts are stored |

> **On `GROQ_MAX_TOKENS` and `GROQ_REASONING_EFFORT`:** the default chat model is a *reasoning* model — its internal thinking tokens consume the same completion budget as the answer. If that budget runs out mid-response, Groq rejects the whole thing server-side with `json_validate_failed` and returns no content, which looks like a prompt bug but is not one. Raise `GROQ_MAX_TOKENS` for unusually long deliverables rather than rewriting prompts. See SPEC.md §3 for the full diagnosis.

### 5.3 Start PostgreSQL

The schema in `backend/migrations/init.sql` is applied automatically when the container initialises.

**With Podman** (the verified path on this machine):

```bash
cd ..    # back to the repository root
podman run -d --name sih-transform-postgres \
  -e POSTGRES_USER=sih -e POSTGRES_PASSWORD=sih -e POSTGRES_DB=sih_transform \
  -p 5434:5432 \
  -v sih_pgdata:/var/lib/postgresql/data \
  -v ./backend/migrations/init.sql:/docker-entrypoint-initdb.d/init.sql:ro,z \
  docker.io/library/postgres:16-alpine
```

**With Docker:**

```bash
cd ..    # back to the repository root
docker compose up -d
```

Verify it is ready:

```bash
podman exec sih-transform-postgres pg_isready -U sih -d sih_transform
# → /var/run/postgresql:5432 - accepting connections
```

On later sessions the container only needs restarting, not recreating:

```bash
podman start sih-transform-postgres
```

### 5.4 Install backend dependencies

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 5.5 Install frontend dependencies

```bash
cd ../frontend
npm install
```

---

## 6. Running the Full Stack

Three components, two terminals (PostgreSQL runs detached in the background).

**Terminal 1 — Backend API**

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Serves on `http://localhost:8000`. Interactive API documentation at `http://localhost:8000/docs`.

**Terminal 2 — Frontend**

```bash
cd frontend
npm run dev
```

Serves on `http://localhost:5173` — **this is the application UI**. Open this one in your browser.

### Service reference

| Service | URL | Purpose |
|---|---|---|
| Frontend | `http://localhost:5173` | The operator interface |
| Backend API | `http://localhost:8000` | REST + SSE; redirects to `/docs` |
| API docs | `http://localhost:8000/docs` | Interactive Swagger UI |
| Health check | `http://localhost:8000/health` | Liveness probe |
| PostgreSQL | `localhost:5434` | Database (user `sih`, password `sih`, database `sih_transform`) |

### Verifying the stack

```bash
curl http://localhost:8000/health
# → {"success":true,"data":{"status":"ok"}}
```

The home page also probes the backend on load: it displays `SYSTEM ONLINE · GROQ LINK ACTIVE` when the API is reachable, and `ENGINE OFFLINE` when it is not.

---

## 7. Using the Platform

1. Open `http://localhost:5173` and click **`[ RUN TRANSFORM ]`** or **`./transform`**.
2. Choose a **source kind** — pasted text, free-form prompt, document, or image — and provide the content.
3. Select **one or more output types** with the `[x]` bracket toggles.
4. Adjust the **generation parameters** as needed. Sensible defaults are pre-filled; blank fields are simply omitted from the prompt.
5. Click **`[ RUN TRANSFORM ]`**. Each deliverable reports its own status live: `[  ]` pending, `[..]` running, `[OK]` complete, `[ERR]` failed.
6. Each finished deliverable appears in its own pane with **`[ RETRY ]`**, **`[ EXPORT .MD ]`**, and **`[ REMOVE ]`** actions. Retrying one deliverable leaves the others untouched.

### Adding a new output type

Add an entry to [`backend/app/prompts.json`](backend/app/prompts.json) with a `type`, `label`, `description`, `system` prompt, and an `instructions` list, then restart the backend. No code changes are required — the registry, dispatcher, API, and frontend all read from that file.

---

## 8. Troubleshooting

Issues genuinely encountered while building and running this project:

| Symptom | Cause | Fix |
|---|---|---|
| `.venv/bin/uvicorn: bad interpreter: No such file or directory` | The virtualenv was created at a different path; scripts hardcode an absolute shebang that breaks when the project directory moves | Launch via the module instead: `.venv/bin/python -m uvicorn app.main:app --port 8000`. To fix permanently, recreate the venv |
| `docker: command not found` / `looking up compose provider failed` | The machine has Podman but no Docker or compose provider | Use the `podman run` command in §5.3 — it replicates `docker-compose.yml` exactly (same container name, port, volume, and init mount) |
| `GROQ_API_KEY is not set` on startup | The backend validates the key at startup, before serving any request | Put a non-empty value in `backend/.env`. Any placeholder lets the server boot, but generation fails until the key is real |
| `{"detail":"Not Found"}` at `http://localhost:8000` | That is the API server, not the UI | Open `http://localhost:5173`. Visiting the API root now redirects to `/docs` |
| `address already in use` on port 8000 | A previous backend is still running | `pkill -f "uvicorn app.main"`, or find the owner with `ss -tlnp \| grep 8000`. Inside a sandboxed terminal, the stale process may live outside your PID namespace |
| `model_not_found` (HTTP 404) from Groq | Groq retires models regularly; a pinned default went away | List current models with `curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models`, then set `GROQ_CHAT_MODEL` in `.env` |
| `json_validate_failed` (HTTP 400) with empty `failed_generation` | The reasoning model exhausted its completion budget mid-JSON; Groq discards the response server-side | Raise `GROQ_MAX_TOKENS` or keep `GROQ_REASONING_EFFORT=low`. **Do not** rewrite prompts to ask for valid JSON — that is not the cause |
| `rate_limit_exceeded` (HTTP 429) during a large job | The Groq free tier allows 8,000 tokens per minute; a seven-type job trips it | Handled automatically — the client waits for the duration Groq specifies and resumes. Persistent failures mean selecting fewer types per job |
| Container starts but `psql` reports "the database system is shutting down" | Normal PostgreSQL initialisation restart on first boot | Wait a few seconds and retry; use `pg_isready` to poll |
| Schema changes do not appear | `init.sql` only runs when the data volume is first created | Recreate the volume: `podman rm -f sih-transform-postgres && podman volume rm sih_pgdata`, then re-run §5.3. **This deletes all data** |

---

## 9. Documentation

- **[SPEC.md](SPEC.md)** — the authoritative architecture document: design decisions and their rationale, the complete data model, every API route, the output-type registry format, and current implementation status. Read this before making changes.
- **`http://localhost:8000/docs`** — interactive API reference generated from the running backend.

---

## 10. Contributors

**Ojas Chaudhary** — [@Ojas1004](https://github.com/Ojas1004)

Built for Smart India Hackathon 2026, Problem Statement 26154, posed by the National Technical Research Organisation (NTRO).

---

## 11. License

No license has been chosen yet. Until one is added, this code is provided for evaluation in the context of Smart India Hackathon 2026 and no usage rights are granted.
