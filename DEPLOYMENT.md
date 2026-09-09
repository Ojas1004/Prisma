# Deployment — Vercel (frontend) + Render (backend) + Supabase (data)

Three services, each doing one job:

| Layer | Host | What it runs |
|---|---|---|
| Frontend | Vercel | `frontend/` Vite static build |
| Backend | Render | `backend/` uvicorn, persistent process |
| Database + Auth | Supabase | Postgres (`DATABASE_URL`) + auth token verification |

Live backend: `https://saralai-clone-for-sih.onrender.com`
Supabase project: `qzdzjqrgponmxqlvvaqx` (region `ap-northeast-1`, Tokyo)

## Why the backend is not on Vercel

Vercel's import screen auto-detects `backend/` as a FastAPI service. **Do not
deploy it there.** It builds fine and fails at runtime, for three reasons:

1. **SSE** — `app/routes.py` returns a `StreamingResponse` fed by `app/sse.py`,
   an in-process `asyncio.Queue` hub. Serverless invocations do not share a
   process, so the publisher and subscriber land in different instances and the
   stream stays silent.
2. **Background jobs** — `app/runner.py` calls `asyncio.create_task` and returns
   immediately; the job runs up to `JOB_TIMEOUT_SECONDS = 900`. Vercel freezes
   the function once the response is sent, killing generation mid-flight.
3. **Local disk** — uploads are written to `DATA_DIR` and read back by the
   runner. Serverless filesystems are ephemeral and per-instance.

Render's free tier runs a long-lived uvicorn process, which satisfies all three
with no code changes.

---

## 1. Supabase — database

Apply `backend/migrations/init.sql` to the project (SQL Editor, or psql). It
creates `transforms` and `sources` and is safe to re-run — every statement is
`IF NOT EXISTS`.

RLS is enabled on both tables with **no policies**, deliberately. All access
goes through the backend, which connects via asyncpg as the table owner and so
bypasses RLS; the frontend uses Supabase for auth only and never queries these
tables directly. Enabling RLS closes the Data API hole (anyone holding the
public anon key could otherwise read and write every row) without affecting the
app. Adding user-scoped policies only becomes necessary if the frontend ever
starts querying Supabase directly.

### DATABASE_URL — use the pooler, not the direct connection

**The direct connection does not work on Render.**
`db.<ref>.supabase.co` resolves to an **IPv6-only** address, and Render's free
tier has no IPv6 egress, so the socket cannot be opened at all:

```
OSError: [Errno 101] Network is unreachable
```

Use the **Session pooler** instead — its hostname is IPv4-reachable. Get it from
the Supabase dashboard: **Connect → Direct → Session pooler**, and copy the
string whole rather than assembling it by hand. The shape is:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Three details that each cost a failed deploy if wrong:

- **Username** is `postgres.<project-ref>`, not plain `postgres`.
- **Region prefix** is part of the hostname and is not guessable — this project
  is `aws-0`, and using `aws-1` fails with
  `(ENOTFOUND) tenant/user postgres.<ref> not found`.
- **Port 5432 on the pooler host is session mode**, which is what you want.
  Port `6543` is transaction mode (pgbouncer), which does not support the
  prepared statements asyncpg uses by default and fails with
  `prepared statement "__asyncpg_stmt_1__" already exists`. Session mode needs
  no code change; transaction mode would require `statement_cache_size=0` on
  the `asyncpg.create_pool` call in `app/db.py`.

Substitute only the password. If it contains `@ : / ? # [ ] %` it must be
percent-encoded (`@` → `%40`); letters, digits and `-` are safe as-is. Note the
connection string template shows the password as `[YOUR-PASSWORD]` — replace
**the brackets too**, not just the text inside them.

## 2. Render — backend

`render.yaml` at the repo root describes the service, or configure it manually:

- **Root Directory** `backend`
- **Build** `pip install -r requirements.txt`
- **Start** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Render's prefilled default (`gunicorn your_application.wsgi`) is wrong twice
over: FastAPI is ASGI, not WSGI, and the module path is a placeholder.
`--host 0.0.0.0` is required or Render's health checks never see an open port.

Environment variables (set in the dashboard; `render.yaml` marks them
`sync: false` so no secret is committed):

| Variable | Value |
|---|---|
| `PYTHON_VERSION` | `3.12` |
| `GROQ_API_KEY` | from console.groq.com |
| `DATABASE_URL` | Supabase **session pooler** string — see above |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` (with scheme) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key — server-side only |
| `CORS_ORIGINS` | the Vercel URL, once step 3 is done |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are read via `os.environ[...]` at
import time in `app/auth.py`, so a missing or misspelled key kills the process
at boot with a `KeyError` rather than failing later. Check the spelling of
`SUPABASE_SERVICE_ROLE_KEY` specifically — `SUPABSE` is an easy typo to miss.

The free tier sleeps after ~15 minutes idle and takes ~50s to wake. Hit
`/api/output-types` shortly before a demo.

## 3. Vercel — frontend

**Root Directory must be `frontend`.** Remove the auto-detected `backend`
service from the import screen.

- **Framework Preset** Vite (infers `npm run build` → `dist`)
- `frontend/vercel.json` supplies the SPA rewrite, so a hard refresh on
  `/transform` does not 404.

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://saralai-clone-for-sih.onrender.com` |
| `VITE_SUPABASE_URL` | same as the backend's `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | the anon/publishable key — never service_role |

Vite inlines `import.meta.env.*` at **build** time, so these must be set before
deploying; changing one later needs a rebuild, not just a restart.

## 4. Close the loop

Set `CORS_ORIGINS` on Render to the exact Vercel origin (no trailing slash) and
redeploy. The `*` default works but lets any site call the API.

Order matters: **Supabase → Render → Vercel → CORS**, since each step needs the
previous one's URL.

---

## Verifying a deploy

```sh
curl https://saralai-clone-for-sih.onrender.com/api/output-types
```

`/api/output-types` needs no auth, so a JSON envelope back proves the process,
the database pool and the prompt config are all healthy. In the Render logs,
success looks like:

```
INFO:     Application startup complete.
==> Your service is live 🎉
```

Failures seen in practice, and what each means:

| Log line | Cause |
|---|---|
| `KeyError: 'SUPABASE_...'` | env var missing or misspelled |
| `OSError: [Errno 101] Network is unreachable` | direct connection — IPv6; use the pooler |
| `(ENOTFOUND) tenant/user postgres.<ref> not found` | wrong pooler region prefix or plain `postgres` username |
| `prepared statement ... already exists` | transaction pooler (`:6543`); use session mode (`:5432`) |
| `password authentication failed` | `[YOUR-PASSWORD]` brackets left in, or unencoded special character |
| `No open ports detected` | start command missing `--host 0.0.0.0` |

## Groq rate limits

The free tier's 8000 TPM window is shared by prompt + completion reservation,
and Groq counts the full `max_tokens` reservation whether it is used or not.
Long jobs will still show `429 ... rate limited, waiting Ns` in the logs; the
client honours Groq's `retry-after` and recovers on its own, so these are slow,
not broken. See `app/chunking.py` for how the chunk, map and reduce budgets
derive from that cap.
