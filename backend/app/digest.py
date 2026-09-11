"""Map/reduce digest for chunked sources.

Runs once per source document, between source resolution and the runner's
per-deliverable loop. The map step extracts a structured, attributed summary
from each chunk at reasoning_effort="low" (reusing the existing effort
control in llm.chat, not a parallel mechanism); the reduce step concatenates
those summaries into the source text every deliverable then generates from.

Requirement 4 — contradiction preservation — is the reason the reduce step
is a plain concatenation rather than a synthesis call. Merging chunk
summaries with an LLM is exactly what would smooth away the disagreement
between chunk 2 and chunk 7. Instead every summary keeps its CHUNK N label
and the assembled block instructs the final generation call to treat
conflicting claims as findings to surface, not noise to reconcile.
"""

import logging

from app import llm
from app.chunking import (
    MAP_COMPLETION_TOKENS,
    REDUCE_INPUT_TOKENS,
    SUMMARY_TOKEN_CAP,
    Chunk,
    ChunkPlan,
    ChunkSummary,
    estimate_tokens,
)

log = logging.getLogger("digest")

MAP_SYSTEM = """You are extracting source material for downstream document generation.
Read ONE chunk of a larger document and record what it contains — do not
summarize impressionistically, do not editorialize, and do not resolve
anything against knowledge outside this chunk.

Return plain text in exactly this shape:

FACTS: the concrete, verifiable statements in this chunk, including figures,
dates and quantities, as one dense paragraph.
ENTITIES: semicolon-separated people, organizations, places, products, periods.
CLAIMS: assertions, opinions, projections and attributed statements — who
claims what. Keep the attribution ("Rivera states...", "the report asserts...").
Record a claim even if it looks doubtful or contradicts general knowledge.

Be dense and factual. Hard limit: {cap} words total."""

# Framing for the concatenated summaries. This is what makes contradiction
# surfacing possible downstream — the generation call is told explicitly that
# chunks may disagree and that disagreement is signal.
REDUCE_HEADER = """SOURCE MATERIAL — this document was too large for one pass, so it was split
into {n} sequential chunks and each was extracted separately. Below are the
per-chunk extractions, each labelled with the chunk it came from.

IMPORTANT: chunks may disagree with one another. Where two chunks make
conflicting claims, that conflict is real and belongs in the deliverable as a
finding — flag it and attribute both sides to their chunk. Do NOT silently
reconcile, average, or drop either side of a contradiction."""


async def map_chunk(client: llm.GroqClient, chunk: Chunk, total: int) -> ChunkSummary:
    """Extract one chunk at low effort. Attribution (the chunk index) is
    attached here and carried through the reduce step unchanged."""
    prompt = (
        f"{MAP_SYSTEM.format(cap=int(SUMMARY_TOKEN_CAP / 1.3))}\n\n"
        f"This is chunk {chunk.index} of {total}.\n\n"
        f"CHUNK {chunk.index} TEXT:\n<<<\n{chunk.text}\n>>>"
    )
    # reasoning_effort="low" reuses the existing control in llm.chat — the map
    # step is extraction, not composition, and a low-effort call leaves the
    # per-minute window for the deliverable generation that follows. The
    # completion reservation is cut for the same reason: _enforce_cap discards
    # anything past SUMMARY_TOKEN_CAP anyway, and Groq charges the full
    # reservation against the per-minute window whether it is used or not.
    # `label` tags this call in llm.chat's truncation-cascade logs, so a map
    # escalation reads as "map chunk 3/5" rather than being indistinguishable
    # from a deliverable-generation escalation.
    result = await client.chat(
        [llm.text_message("user", prompt)],
        reasoning_effort="low",
        max_tokens=MAP_COMPLETION_TOKENS,
        label=f"map chunk {chunk.index}/{total}",
    )
    return ChunkSummary(index=chunk.index, text=_enforce_cap(result.text.strip(), chunk.index))


def _enforce_cap(text: str, index: int) -> str:
    """The word limit in MAP_SYSTEM is a request, and models routinely
    overshoot it — observed ~325 tokens against a 175-token ask. The reduce
    budget is derived from this cap, so it has to hold in code, not just in
    the prompt. Trimming happens per FIELD so a long FACTS line can never
    starve the CLAIMS line: losing CLAIMS would lose the attribution that
    contradiction surfacing depends on (requirement 4)."""
    if estimate_tokens(text) <= SUMMARY_TOKEN_CAP:
        return text

    # Split into the three labelled fields, keeping order.
    fields: list[tuple[str, str]] = []
    current_label, buf = "", []
    for line in text.splitlines():
        stripped = line.strip()
        label = next((k for k in ("FACTS:", "ENTITIES:", "CLAIMS:") if stripped.upper().startswith(k)), "")
        if label:
            if current_label:
                fields.append((current_label, " ".join(buf).strip()))
            current_label, buf = label, [stripped[len(label):].strip()]
        elif current_label:
            buf.append(stripped)
    if current_label:
        fields.append((current_label, " ".join(buf).strip()))

    if not fields:  # unparseable — fall back to a whole-text trim
        return _trim_words(text, SUMMARY_TOKEN_CAP)

    # CLAIMS carries attribution, so it gets the largest share and is trimmed
    # last. Shares sum to the cap.
    shares = {"FACTS:": 0.40, "ENTITIES:": 0.18, "CLAIMS:": 0.42}
    # Budget the field allowances against the cap MINUS the labels themselves
    # and per-field rounding, so the assembled summary lands under the cap
    # rather than a few tokens over it.
    budget = SUMMARY_TOKEN_CAP - 3 * len(fields)
    out = []
    for label, body in fields:
        allowance = int(budget * shares.get(label, 0.33))
        out.append(f"{label} {_trim_words(body, allowance)}")
    trimmed = "\n".join(out)
    # Cheap guarantee: if labels/rounding still pushed it over, trim the whole.
    if estimate_tokens(trimmed) > SUMMARY_TOKEN_CAP:
        trimmed = _trim_words(trimmed, SUMMARY_TOKEN_CAP)
    log.info(
        "[digest] chunk %d summary capped: %d -> %d tokens",
        index, estimate_tokens(text), estimate_tokens(trimmed),
    )
    return trimmed


def _trim_words(text: str, max_tokens: int) -> str:
    """Cut to a token allowance on a word boundary, marking the cut so the
    generation step can tell a trimmed field from a complete one.

    Measured with estimate_tokens rather than a plain word count: that
    estimator floors on characters, so long unbroken strings (figures, URLs,
    identifiers) cost more than their word count suggests and a word-only
    limit would overshoot the cap."""
    if estimate_tokens(text) <= max_tokens:
        return text
    words = text.split()
    lo, hi = 0, len(words)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if estimate_tokens(" ".join(words[:mid])) <= max_tokens:
            lo = mid
        else:
            hi = mid - 1
    return " ".join(words[:lo]) + " [...]"


def reduce_summaries(summaries: list[ChunkSummary]) -> str:
    """Concatenate — deliberately NOT synthesize. Each summary keeps its
    chunk label so a downstream contradiction remains traceable to its
    sources (requirement 4)."""
    body = "\n\n".join(f"--- CHUNK {s.index} ---\n{s.text}" for s in summaries)
    return f"{REDUCE_HEADER.format(n=len(summaries))}\n\n<<<\n{body}\n>>>"


async def build_digest(client: llm.GroqClient, plan: ChunkPlan, progress=None) -> str:
    """Map every chunk, then reduce. Returns the text that replaces the raw
    source for every deliverable in the job."""
    summaries: list[ChunkSummary] = []
    for chunk in plan.chunks:
        if progress:
            await progress(
                "mapping_chunks",
                f"Reading chunk {chunk.index} of {plan.count} (~{chunk.tokens:,} tokens)...",
            )
        summary = await map_chunk(client, chunk, plan.count)
        log.info(
            "[digest] chunk %d/%d mapped: %d chars in -> %d chars out",
            chunk.index, plan.count, len(chunk.text), len(summary.text),
        )
        summaries.append(summary)

    digest = reduce_summaries(summaries)
    log.info(
        "[digest] reduce input is %d tokens (budget %d, cap %d/chunk x %d chunks)",
        estimate_tokens(digest), REDUCE_INPUT_TOKENS, SUMMARY_TOKEN_CAP, plan.count,
    )
    log.info(
        "[digest] reduced %d chunks (~%d source tokens) into %d chars",
        plan.count, plan.total_tokens, len(digest),
    )
    return digest
