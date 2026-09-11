# Prisma — Technical Approach

> One source document in. Seven purpose-built deliverables out. In a single pass.

---

## 1. The Problem

Teams rewrite the same source material over and over for different channels.
A single report becomes a LinkedIn post, an X post, an advisory, a summary,
a deck — each written by hand, each drifting further from the original.

Doing this with a normal chatbot means many separate conversations. The AI
forgets context between them, and the outputs quietly contradict each other.

---

## 2. Core Idea

**Read the source once. Write every format from that one reading.**

This keeps all deliverables factually consistent, because they share the same
understanding of the source instead of being generated independently.

---

## 3. System Architecture

```
   React + TypeScript (Vite)
              |
         REST + SSE
              |
     FastAPI  (Python)
              |
   +----------+----------+
   |          |          |
 Groq LLM  PostgreSQL  Supabase
 (compute) (job state)  (auth)
```

| Layer | Technology | Role |
|---|---|---|
| Frontend | React 19, TypeScript, Tailwind | Operator console + live progress |
| Backend | FastAPI, asyncio | Job orchestration |
| AI | Groq (`gpt-oss-120b`) | Text generation + vision |
| Database | PostgreSQL (asyncpg) | Jobs, artifacts, saved sources |
| Auth | Supabase | Sign-in, per-user data |

---

## 4. The Pipeline

**Ingest → Chunk → Map → Reduce → Generate → Stream**

1. **Ingest** — accept pasted text, PDF, Markdown, or an image.
   PDFs are text-extracted; images use the vision model.
2. **Chunk** — split long documents into overlapping pieces (only if needed).
3. **Map** — extract structured facts from each chunk.
4. **Reduce** — stitch those extracts into one compact digest.
5. **Generate** — write each selected deliverable from that shared digest.
6. **Stream** — push live progress to the browser as each one completes.

---

## 5. Key Technical Decisions

### A. Chunking for long documents

A large document cannot fit in one AI request. We split it into overlapping
windows, cutting at paragraph boundaries so sentences are never severed.
Each chunk is summarised separately, then the summaries are combined.

**Why overlap?** A claim spanning a boundary still appears whole in one of
the two neighbouring chunks.

### B. Stitching, not merging

The chunk summaries are **joined together, not re-summarised by the AI**.

This is deliberate. Asking a model to merge summaries is exactly what smooths
away genuine disagreements in the source. Instead each summary keeps its
chunk label, and the final step is told that contradictions are **findings to
report**, not noise to clean up.

### C. Working inside a hard rate limit

The free AI tier allows only **8,000 tokens per minute** — the real constraint
is not the model's capacity but the account's quota.

Every size in the system is derived from that number:

| Step | Budget | Reasoning |
|---|---|---|
| Chunk size | ~2,000 tokens | Lets 2–3 chunks clear per minute |
| Chunk summary | 175 tokens | Enforced in code, not just requested |
| Final input | ~2,800 tokens | Leaves room for the answer |

Requests are also generated **one at a time**, not in parallel — firing seven
at once would simply trip the limit and stall.

### D. Failing honestly

Documents beyond roughly **40 pages** are rejected with a clear message naming
the exact limit exceeded — rather than silently truncating the source and
producing a confident but incomplete deliverable.

### E. Degrading instead of crashing

The AI client handles real-world failure automatically:

- **429 (rate limited)** → wait the requested time, then resume
- **413 (request too large)** → halve the reserved space and retry
- **Truncated output** → step down reasoning effort, give the answer more room
- **One format fails** → the other formats still complete

---

## 6. Operator Control

Six parameters are applied to **every** selected deliverable in a run:

`Audience` · `Tone` · `Language` · `Level of Detail` · `Objective` · `Style`

The seven output formats:

`Video Package` · `LinkedIn Post` · `X Post` · `Advisory`
`Executive Summary` · `Presentation` · `Infographic`

---

## 7. What Makes It Different

| Ordinary AI chat | Prisma |
|---|---|
| Re-explain source each time | Read once, reuse everywhere |
| Formats drift apart | One shared context |
| Contradictions smoothed over | Contradictions surfaced |
| Silent truncation | Explicit, honest limits |
| One output per conversation | Seven in one pass |

---

## 8. Engineering Principles

- **Derive limits from real constraints**, not guesses — every budget traces
  back to the measured 8,000 TPM ceiling.
- **Enforce in code, not in prompts** — a model asked for 175 tokens will
  overshoot; the cap is applied after generation.
- **Fail loudly over failing quietly** — a clear error beats a silently
  degraded document.
- **Never display invented data** — no fabricated metrics anywhere in the UI.
