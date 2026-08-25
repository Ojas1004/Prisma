# TERMINAL — Gen AI Platform for Automated Content Transformation

Transform one piece of source material into every communication deliverable you need — in one submission, in seconds.

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-gpt--oss--120b-F55036?logo=groq&logoColor=white)

Built for **Smart India Hackathon 2026**, Problem Statement **26154**, posed by the **National Technical Research Organisation (NTRO)**. Category: Software. Theme: Smart Automation. ("TERMINAL" is a working title — the project name is not final.)

---

## Overview

Organisations constantly need to turn one source of information — a threat advisory, an incident report, a policy document, a news article — into many different communication artefacts, each with its own format, tone, and audience. Doing that by hand is slow, produces inconsistent results, and demands both domain knowledge and communication expertise.

TERMINAL automates that work. An operator submits source content, selects one or more deliverable types, tunes how the output should read, and gets back publication-ready text with live progress as each deliverable is generated. Source content can be pasted text, a free-form prompt, a PDF/TXT/MD document, or an image — images are routed automatically to a vision model, and PDFs have their text extracted before generation.

The whole core pipeline runs on the Groq API free tier. There is no paid dependency anywhere in the spec-required feature set.

---

## What it does

**Seven deliverable types, all of them text.** This follows the problem statement's own examples: "Video" means a production package a team can shoot from — script with timestamps, storyboard shot list, scene descriptions, narration, subtitle cues, and visual recommendations — not a rendered MP4. "Infographic" likewise means designer-ready content: key messaging, content blocks, layout recommendations, data callouts, and design notes, rather than a rendered image. The other five are a LinkedIn post ready to paste, a Twitter/X tweet or numbered thread within platform limits, a national-CERT-style advisory (overview, severity, affected systems, technical detail, indicators, recommended actions, references), an executive summary opening with a BLUF paragraph, and a slide-by-slide presentation with speaker notes.

**Multi-select in a single job.** Select any combination of those seven and submit once. The source is read a single time, then each deliverable is generated from it and returned together as one bundle — not as separate jobs you have to run one at a time.

**Six parameters that tune every deliverable.** Three are free text: the target audience, the language to write in, and the communication objective. Three are fixed choices: tone (`formal`, `neutral`, `urgent`, or `conversational`), level of detail (`brief`, `standard`, or `comprehensive`), and content style (`factual`, `analytical`, `narrative`, or `persuasive`). Sensible defaults are pre-filled and blank fields are simply left out of the prompt, so you can run a job without touching any of them.

**Live per-type progress.** Each deliverable reports its own stage over a single Server-Sent Events stream, so a seven-type job shows real progress across all seven rather than one opaque spinner.

**Partial failure is handled.** If one output type fails, the rest still complete and return. The failure is recorded against that deliverable alone, and you can retry just that one without regenerating anything else.

**Output types are configuration, not code.** They live in `backend/app/prompts.json` along with the parameter definitions. Adding a deliverable type or rewording an existing one is a JSON edit — the registry, dispatcher, API, and frontend all read from that file.

---

## Tech stack

The frontend is React 19 with Vite 6 and TypeScript in strict mode — a single-page app with no router and no styling or animation libraries, since the "Terminal CLI" visual design is hand-rolled CSS.

The backend is Python 3.13 with FastAPI, async throughout, running generation jobs as background `asyncio` tasks and publishing progress through an in-process pub/sub hub. There is no queue or broker.

Data lives in PostgreSQL 16, accessed with raw SQL through `asyncpg` — no ORM. It runs in a container on host port 5434, under Podman or Docker.

Text generation uses Groq's `openai/gpt-oss-120b` over their OpenAI-compatible chat completions API in JSON mode. Image sources are handled by `qwen/qwen3.6-27b`, selected automatically whenever a request carries an image.

Deliberately absent: Redis, Celery, Go services, Next.js, an ORM, cloud storage, and any paid API in the core pipeline.

---

## Project structure

```
.
├── README.md                       this file
├── SPEC.md                         architecture, decisions, and current state — the source of truth
├── docker-compose.yml              PostgreSQL 16 on host port 5434 (Podman equivalent in Setup)
│
├── backend/
│   ├── requirements.txt            fastapi, uvicorn, asyncpg, httpx, python-dotenv, python-multipart, pypdf
│   ├── .env.example                template for the environment variables described below
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

Runtime files land in `backend/data/` (`uploads/` and `artifacts/`) and are gitignored.

---

## Prerequisites

You need Python 3.13 or newer (verified on 3.13.14), Node.js 20 or newer with npm 10 (verified on 22.23.2 and 10.9.8), and either Podman 5.x or Docker 24+ to run PostgreSQL locally. You also need a Groq API key, which is free from [console.groq.com](https://console.groq.com).

A PostgreSQL client is optional — handy for inspecting the database, but the server itself runs in the container.

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/Ojas1004/SaralAI-Clone-For-SIH.git
cd SaralAI-Clone-For-SIH
```

Everything below is relative to this repository root.

### 2. Configure the backend environment

```bash
cd backend
cp .env.example .env
```

Open `.env` and put your Groq API key in it. The backend checks for a non-empty `GROQ_API_KEY` at startup and refuses to boot without one, so this step is not optional:

```ini
GROQ_API_KEY=gsk_your_key_here
DATABASE_URL=postgresql://sih:sih@localhost:5434/sih_transform
```

Those two are all you need. Everything else has a working default: `GROQ_BASE_URL` points at Groq's OpenAI-compatible endpoint, `GROQ_CHAT_MODEL` is `openai/gpt-oss-120b`, `GROQ_VISION_MODEL` is `qwen/qwen3.6-27b`, `CORS_ORIGINS` allows everything, and `DATA_DIR` puts uploads and artifacts under `backend/data`.

Two other variables are worth knowing about before you need them. `GROQ_MAX_TOKENS` (default 8000) caps the completion budget for a single deliverable, and `GROQ_REASONING_EFFORT` (default `low`) controls how much of that budget the model spends on internal reasoning. The default chat model is a reasoning model, and its thinking tokens come out of the same budget as the answer — if that budget runs out mid-response, Groq rejects the entire thing server-side and returns nothing usable. Raise the token limit for unusually long deliverables rather than rewriting prompts; there is a longer explanation in the troubleshooting section and in SPEC.md.

### 3. Start PostgreSQL

The schema in `backend/migrations/init.sql` is applied automatically the first time the container initialises. From the repository root, run:

```bash
podman run -d --name sih-transform-postgres \
  -e POSTGRES_USER=sih -e POSTGRES_PASSWORD=sih -e POSTGRES_DB=sih_transform \
  -p 5434:5432 \
  -v sih_pgdata:/var/lib/postgresql/data \
  -v ./backend/migrations/init.sql:/docker-entrypoint-initdb.d/init.sql:ro,z \
  docker.io/library/postgres:16-alpine
```

If you have Docker instead, `docker compose up -d` does the same thing using the committed `docker-compose.yml`.

Give it a few seconds, then confirm it is accepting connections:

```bash
podman exec sih-transform-postgres pg_isready -U sih -d sih_transform
```

On later sessions the container only needs starting again, not recreating:

```bash
podman start sih-transform-postgres
```

### 4. Install the backend dependencies

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 5. Install the frontend dependencies

```bash
cd ../frontend
npm install
```

---

## Running the stack

PostgreSQL is already running in the background from setup, so you need two terminals.

In the first, start the API:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

In the second, start the frontend:

```bash
cd frontend
npm run dev
```

The application UI is at **http://localhost:5173** — that is the one to open in your browser. The backend serves on http://localhost:8000, with interactive API documentation at `/docs` and a liveness probe at `/health`; visiting the root redirects you to the docs. PostgreSQL is on `localhost:5434`, with username `sih`, password `sih`, and database `sih_transform`.

### Quick smoke test

Four checks confirm the stack is healthy end to end:

- [ ] **The UI loads.** Open http://localhost:5173 — the landing page appears and the status line reads `SYSTEM ONLINE · GROQ LINK ACTIVE`. If it says `ENGINE OFFLINE`, the backend is not reachable.
- [ ] **The API responds.** `curl http://localhost:8000/health` returns `{"success":true,"data":{"status":"ok"}}`.
- [ ] **The database accepts connections.** `podman exec sih-transform-postgres pg_isready -U sih -d sih_transform` reports `accepting connections`.
- [ ] **A transform completes.** Click `[ RUN TRANSFORM ]`, paste a few sentences of source text, tick one output type such as `./executive_summary`, and run it. The status line moves from `[..]` to `[OK]` and the generated deliverable appears in its own pane. This is the check that proves your Groq key works.

---

## Using the platform

Open the UI and click `[ RUN TRANSFORM ]` or `./transform` in the nav. Choose a source kind — pasted text, a free-form prompt, a document, or an image — and provide the content. Tick one or more output types with the `[x]` bracket toggles, adjust the generation parameters if you want to, and run it.

Each selected deliverable reports its own status as the job progresses: `[  ]` pending, `[..]` running, `[OK]` complete, `[ERR]` failed. Finished deliverables appear in separate panes, each with its own retry, export-to-Markdown, and remove actions. Retrying one deliverable regenerates only that one and leaves the rest untouched.

To add a new output type, add an entry to `backend/app/prompts.json` with a `type`, `label`, `description`, `system` prompt, and a list of `instructions`, then restart the backend. No code changes are needed.

---

## Troubleshooting

These are the problems actually hit while building and running this project.

**`.venv/bin/uvicorn: bad interpreter: No such file or directory`** — virtualenv scripts hardcode an absolute path in their shebang, which breaks if the project directory is ever moved or renamed. Launch through the module instead, as the run instructions above do: `.venv/bin/python -m uvicorn app.main:app --port 8000`. Recreating the venv fixes it permanently.

**`docker: command not found`, or `looking up compose provider failed`** — the machine has Podman but no Docker. Use the `podman run` command in the setup section; it replicates `docker-compose.yml` exactly, with the same container name, port, volume, and init-script mount. The `:z` suffix on that mount is the SELinux relabel flag, which Fedora and RHEL-family systems need.

**`GROQ_API_KEY is not set` on startup** — the backend validates the key before it serves anything. Put a non-empty value in `backend/.env`. Any placeholder gets the server booting, but generation will fail until the key is real.

**`{"detail":"Not Found"}` at http://localhost:8000** — that is the API server, not the UI. The application is at http://localhost:5173. Visiting the API root now redirects to `/docs` instead of 404ing.

**`address already in use` on port 8000** — an older backend is still running. `pkill -f "uvicorn app.main"` usually clears it; if not, `ss -tlnp | grep 8000` identifies the owner. Note that in a sandboxed terminal the stale process may live outside your PID namespace, in which case you have to kill it from the host.

**`model_not_found` (HTTP 404) from Groq** — Groq retires models regularly, and a pinned default has gone away. This has already happened once to this project. List what is currently available with `curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models`, then set `GROQ_CHAT_MODEL` in `.env` to something from that list.

**`json_validate_failed` (HTTP 400) with an empty `failed_generation`** — this looks like a prompt or JSON-escaping bug and is neither. The chat model is a reasoning model whose thinking tokens share the completion budget with the answer; when that budget runs out mid-document, Groq's JSON-mode validator discards the whole response server-side and returns no content, so the truncation is invisible. The fix is to raise `GROQ_MAX_TOKENS` or keep `GROQ_REASONING_EFFORT` at `low` — not to rewrite prompts asking for valid JSON. SPEC.md documents the full diagnosis.

**`rate_limit_exceeded` (HTTP 429) during a large job** — the Groq free tier allows 8,000 tokens per minute, and a seven-type job trips it. The client already handles this by waiting for however long Groq asks and then resuming, so it usually resolves itself. If jobs keep failing, select fewer types at a time.

**"the database system is shutting down" right after the container starts** — normal. PostgreSQL restarts once during first-time initialisation. Wait a few seconds and use `pg_isready` to poll rather than guessing.

**Schema changes do not show up** — `init.sql` only runs when the data volume is created, so an existing volume keeps the old schema. Recreate both with `podman rm -f sih-transform-postgres && podman volume rm sih_pgdata`, then run the container command again. This deletes all existing data, which is fine in development but worth being deliberate about.

---

## Documentation

[SPEC.md](SPEC.md) is the authoritative architecture document — design decisions and the reasoning behind them, the complete data model, every API route, the output-type registry format, and current implementation status. Read it before making changes. For the API surface specifically, the interactive reference generated by the running backend at http://localhost:8000/docs is usually faster.

---

## Contributors

**Ojas Chaudhary** — [@Ojas1004](https://github.com/Ojas1004)

Built for Smart India Hackathon 2026, Problem Statement 26154, posed by the National Technical Research Organisation (NTRO).

---

## License

No license has been chosen yet. Until one is added, this code is provided for evaluation in the context of Smart India Hackathon 2026, and no usage rights are granted.
