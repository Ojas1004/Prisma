# SIH Transform

Gen AI Platform for Automated Content Transformation — SIH 2026, Problem
Statement **26154** (NTRO, Smart Automation). See [SPEC.md](SPEC.md) for the
full architecture.

Submit source content (text, prompt, PDF/TXT/MD, image) → pick an output type
(summary brief, threat advisory, press release, social post, newsletter,
infographic) → an AI-generated artifact comes back over a live progress stream.

**Stack:** React (Vite) · Python FastAPI · Groq API · PostgreSQL

## Run it

**1. Postgres** (Docker):

```bash
cd SIH
docker compose up -d        # Postgres 16 on localhost:5434, schema auto-applied
```

**2. Backend** (needs a Groq API key — console.groq.com):

```bash
cd SIH/backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # put your GROQ_API_KEY in .env
.venv/bin/uvicorn app.main:app --reload --port 8000
```

**3. Frontend:**

```bash
cd SIH/frontend
npm install
npm run dev                 # http://localhost:5173
```

## Layout

```
SIH/
├── docker-compose.yml           Postgres 16 (host port 5434)
├── backend/
│   ├── migrations/init.sql      schema (auto-applied by compose)
│   ├── requirements.txt
│   └── app/
│       ├── main.py              FastAPI entrypoint
│       ├── routes.py            REST + SSE endpoints
│       ├── runner.py            background job runner (asyncio)
│       ├── generators/          ← pluggable pipeline: one generator per output kind
│       │   ├── __init__.py      Generator base, registry (built from prompts.json)
│       │   ├── text.py          text artifacts
│       │   └── image.py         image artifacts (spec-craft → SVG render)
│       ├── llm.py               Groq client — chat + vision
│       ├── prompts.json         output-type registry: adding a type = a JSON edit
│       ├── sources.py           text / prompt / pdf / image resolution
│       ├── db.py                asyncpg raw-SQL access
│       └── sse.py               in-process progress hub
└── frontend/                    minimal Vite + React client
```

## Adding an output type

Text or image: add an entry to `backend/app/prompts.json` — no code changes.
A future **video** kind: implement one `Generator` subclass in
`app/generators/video.py`, register it in `build_registry`, add the JSON entry.
Runner, routes, DB, and SSE need zero changes.
