# References & Research

Sources, prior art, and external material behind this project. Compiled from
the project's own documentation and dependency manifests — everything here is
traceable to a file in this repository or a public URL.

---

## 1. Problem statement (primary source)

The project exists to answer one brief.

| Field | Value |
|---|---|
| Event | Smart India Hackathon (SIH) 2026 |
| Problem Statement ID | **26154** |
| Title | Gen AI Platform for Automated Content Transformation |
| Posed by | National Technical Research Organisation (NTRO) |
| Category | Software |
| Theme | Smart Automation |

The verbatim brief is reproduced in [SPEC.md](SPEC.md) §1 ("Original problem
statement"). Note the caveat recorded there: the portal screenshot was
**truncated mid-description**, and the passage marked `[TRUNCATED]` was never
captured. If you need the complete text, re-copy it from the SIH portal.

The brief is also what fixes the seven deliverable types — its own examples
name video packages, infographics, social posts, advisories, summaries and
presentations, which is why the registry has exactly those. See
[README.md](README.md) §"Seven deliverable types".

---

## 2. Prior art studied

### SARAL — IIIT Hyderabad

A research-paper-to-media platform. Used **as reference material only** for
architecture conventions; **no code is shared with it**, and per
[SPEC.md](SPEC.md) §1 it must never be modified.

Practical way to tell them apart: if the working directory contains
`backend/gateway` (Go) or `frontend/app` (Next.js), that is SARAL, not this
project.

Its influence is visible mainly as a negative result — [SPEC.md](SPEC.md) §9
records that the Go+Redis and Next.js iterations modelled on it were
**deliberately discarded** in favour of the current FastAPI + Vite stack.

### This repository

- `https://github.com/Ojas1004/SaralAI-Clone-For-SIH` — clone URL in
  [README.md](README.md) §"Running locally". The repo name reflects the
  original clone lineage, not the current architecture.

---

## 3. External services & their documentation

| Service | Role | Endpoint / docs |
|---|---|---|
| **Groq** | Primary LLM (production) | `https://api.groq.com/openai/v1` · [console.groq.com/docs/models](https://console.groq.com/docs/models) |
| Groq — reasoning | `reasoning_effort` vocabulary | [console.groq.com/docs/reasoning](https://console.groq.com/docs/reasoning) |
| **OpenRouter** | Alternate provider (local testing only) | `https://openrouter.ai/api/v1` · [openrouter.ai/docs](https://openrouter.ai/docs) |
| OpenRouter — model catalog | Verifying a slug is live and free | `GET https://openrouter.ai/api/v1/models` |
| **Supabase** | Authentication only | [supabase.com/docs](https://supabase.com/docs) |
| **PostgreSQL 16** | Job state, artifacts, saved sources | [postgresql.org/docs](https://www.postgresql.org/docs/16/) |

Models in use — `openai/gpt-oss-120b` for text, `qwen/qwen3.6-27b` for vision
(auto-selected when a message carries image parts). Defaults live in
[backend/app/config.py](backend/app/config.py).

> Groq retires models regularly, and a pinned default has already gone away
> once in this project's history ([README.md](README.md) §Troubleshooting).
> List what is live with
> `curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models`.

---

## 4. Engineering research recorded in-repo

These are findings the project derived itself, each written up where the
reasoning lives. They are the closest thing this codebase has to a results
section.

| Topic | Finding | Where |
|---|---|---|
| Generation budget | Why `GROQ_MAX_TOKENS` and `GROQ_REASONING_EFFORT` exist: `gpt-oss-120b` is a *reasoning* model, so thinking tokens and the answer share one completion budget. A tight budget starves the deliverable twice. | [SPEC.md](SPEC.md) §3 |
| Rate-limit tier | The account is Groq `on_demand` with a hard **8,000 TPM** cap. All chunk/map/reduce sizes derive from it. | [backend/app/chunking.py](backend/app/chunking.py) |
| Truncation cascade | Effort ladder `high→medium→low`, then `max_tokens` doubling ×2 capped at 8000; 413 halves the reservation, 429 obeys `Retry-After`. | [backend/app/llm.py](backend/app/llm.py) |
| Chunking | Long documents are split into overlapping chunks (~2,000 tokens, 12% overlap) and map-reduced into a digest, rather than truncated. | [EXPLAIN.md](EXPLAIN.md), [backend/app/chunking.py](backend/app/chunking.py) |
| Core architecture | "Read the source once, write every format from that one reading" — keeps deliverables factually consistent instead of mutually contradictory. | [technical_approach.md](technical_approach.md) §2, [SPEC.md](SPEC.md) §2 |

### Provider-compatibility findings (11 Sep 2026)

Recorded while adding the OpenRouter testing switch. Both providers are
OpenAI-compatible, but **not** behaviourally identical:

1. `json_validate_failed` is **Groq-specific**. OpenRouter reports
   `max_tokens_exceeded` / `context_length_exceeded` on 400 instead, so the
   400-based branch of the truncation cascade does not fire there.
2. `Retry-After` on 429 is **conditional** on OpenRouter — sent only when every
   attempted upstream provider returned a retry hint.
3. OpenRouter free-tier limits are **request-based** (20/min; 50/day under $10
   lifetime credits), not token-based, so 413-driven `max_tokens` halving
   rarely triggers.
4. `openai/gpt-oss-120b:free` **404s** — removed from the catalog; only the
   paid slug remains.
5. Some models (e.g. `nvidia/nemotron-3-super-120b-a12b:free`) **leak reasoning
   into `content`**, returning identical `reasoning` and `content` fields. Under
   a small completion budget the answer never begins.

Consequence: an OpenRouter run exercises different failure modes than
production and cannot fully validate Groq-path fixes.

---

## 5. Technology stack

Versions are as pinned in the manifests, not as documented prose.

### Backend — [backend/requirements.txt](backend/requirements.txt)

| Package | Min version | Role |
|---|---|---|
| fastapi | 0.115 | HTTP framework |
| uvicorn[standard] | 0.32 | ASGI server |
| asyncpg | 0.30 | PostgreSQL driver |
| httpx | 0.28 | Async HTTP client (LLM calls) |
| python-dotenv | 1.0 | `.env` loading |
| python-multipart | 0.0.18 | File uploads |
| pypdf | 5.1 | PDF text extraction |
| supabase | 2.9.0 | Auth |

### Frontend — [frontend/package.json](frontend/package.json)

| Package | Version | Role |
|---|---|---|
| react / react-dom | ^19.0.0 | UI runtime |
| typescript | ^5.7.0 | Types |
| vite | ^6.0.0 | Dev server + build |
| tailwindcss | ^4.3.3 | Styling |
| react-router-dom | ^7.18.3 | Routing |
| @supabase/supabase-js | ^2.116.0 | Auth client |
| framer-motion | ^13.1.1 | Animation |
| gsap | ^3.15.0 | Animation ([standard license](https://gsap.com/standard-license)) |
| ogl | ^1.0.11 | WebGL effects |
| @radix-ui/* | ^1.x | Accessible primitives |
| lucide-react | ^1.35.0 | Icons |
| class-variance-authority, clsx, tailwind-merge | — | Class composition |

### Assets — see [DESIGN_PHILOSOPHY.md](DESIGN_PHILOSOPHY.md)

- **Inter** (400–700) and **Font Awesome**, loaded in `index.html`.
- `public/assets/logo.webp` and `public/fonts/GeistPixel-Circle.woff2` are
  **generated placeholders** — a white circular mark and a stub font — not
  licensed third-party assets. Replace before any public release.

---

## 6. Project documentation map

Internal docs, by what you would go to them for.

| Document | Contents |
|---|---|
| [SPEC.md](SPEC.md) | **Authoritative** architecture document — decisions and reasoning, data model, API routes, registry format, implementation status. Read before making changes. |
| [technical_approach.md](technical_approach.md) | Condensed pitch: problem, core idea, architecture diagram, pipeline. |
| [README.md](README.md) | Setup, environment variables, troubleshooting. |
| [EXPLAIN.md](EXPLAIN.md) / [explanation simplified.md](explanation%20simplified.md) | Plain-language walkthroughs, incl. the chunking rationale. |
| [DESIGN_PHILOSOPHY.md](DESIGN_PHILOSOPHY.md) | Visual system, typography, asset inventory. |
| [PROGRESSION.md](PROGRESSION.md) | Build history and iteration log. |
| [DEPLOYMENT.md](DEPLOYMENT.md) / [frontend/DEPLOY.md](frontend/DEPLOY.md) | Render + Vercel deployment. |

A live API reference is generated by the running backend at
`http://localhost:8000/docs` — usually faster than reading route definitions.

---

## 7. Scope note

This platform is **general-purpose**. Although the brief was posed by NTRO,
the system prompt in [backend/app/prompts.json](backend/app/prompts.json)
deliberately asserts **no** organization, agency, sector or audience — framing
is taken entirely from the submitted source material. An earlier revision
named NTRO in the global system prompt, which caused generic input to be
branded as NTRO communications; that was removed on 11 Sep 2026.

---

## 8. Not included

Stated plainly so absence is not mistaken for oversight:

- **No academic citations.** This is an engineering submission; no papers are
  cited by the implementation. The map-reduce summarisation pattern is
  standard practice, applied here without reference to a specific publication.
- **No datasets.** Nothing is trained or fine-tuned; all inference is via
  hosted APIs.
- **No benchmark suite.** Behaviour was verified by running real documents end
  to end (the "Attention Is All You Need" paper, 32,623 characters → 5 chunks,
  is the recurring fixture), not by a scored evaluation harness.
