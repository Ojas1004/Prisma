"""Token-aware chunking for large sources.

Runs ONCE per source document at ingestion — before the runner's
per-deliverable loop — so a multi-select job chunks and maps a single time
and then reuses the reduced summary for every deliverable.

Budget math (all figures in tokens, estimated as words * 1.3):

The binding constraint is the account's per-minute token limit, NOT the
model's context window. openai/gpt-oss-120b has a 131,072-token context and
65,536 max completion tokens, but the account's Groq tier allows 8,000 TPM
(confirmed live from the x-ratelimit-limit-tokens response header). We hit
the rate limit at ~6% of the context window, so TPM is what every number
below is derived from.

MAP CALL (per chunk):
    8,000  TPM ceiling
   -1,500  completion reservation (MIN_COMPLETION_TOKENS — a structured
           summary, not a deliverable)
   -  600  system prompt + map instructions + JSON schema
   -  400  safety margin for server-side window drift
   ------
    5,500  absolute ceiling for one chunk's text

We deliberately do NOT size chunks to 5,500. A multi-select run fires N map
calls plus M deliverable calls back-to-back inside the same 60s window, and
the deliverable calls are the expensive ones. Sizing a map call to a third
of the window lets 2-3 of them clear per minute instead of forcing a
rate-limit wait between every single chunk:

    ~2,600  target total map call
    -1,500  completion reservation
    -  600  prompt overhead
    ------
     2,000  chunk text budget  ->  CHUNK_TOKENS

REDUCE CALL (once, feeds the existing per-deliverable generate()):
    8,000  TPM ceiling
   -4,000  completion reservation. NOTE: GROQ_MAX_TOKENS is 8,000, which on
           its own equals the entire window — every such request 413s and
           llm._post halves the reservation to 4,000. That halved value is
           the honest number to budget against.
   -  627  deliverable prompt overhead, MEASURED from prompts.json
           (global system 203 + worst type 256 + schema 48 + params 120)
   -  400  safety margin
   ------
    2,973  ->  REDUCE_INPUT_TOKENS budget of 2,800

A dense, attribution-complete chunk summary measures ~114 tokens, so the
per-chunk cap is 175 (50% headroom). 2,800 / 175 = 16, and we take 14 as
the threshold to keep margin. That supports documents up to ~112,000 chars
(~40 pages) — past that we fail loudly rather than flattening claims or
building a recursive reduce tree.
"""

import logging

from app import config
import re
from dataclasses import dataclass, field

log = logging.getLogger("chunking")

# ── Estimation ────────────────────────────────────────────────────────────
# Word count * 1.3. Deliberately not a real tokenizer: adding tiktoken or
# transformers for a sizing heuristic is not worth the dependency, and the
# 1.3 factor is conservative for English prose.
TOKENS_PER_WORD = 1.3
CHARS_PER_TOKEN = 4  # cross-check only

CHUNK_TOKENS = 2_000
CHUNK_CHARS = CHUNK_TOKENS * CHARS_PER_TOKEN  # 8,000
OVERLAP_RATIO = 0.12  # 12% — ~240 tokens, 2-3 paragraphs of carry-over
OVERLAP_CHARS = int(CHUNK_CHARS * OVERLAP_RATIO)  # 960

# Absolute ceiling for a single map call's text (see budget math above).
# An indivisible unit larger than this cannot be mapped at all.
MAP_CHUNK_CEILING_TOKENS = 5_500

# Map-step completion reservation. The map step's output is capped at
# SUMMARY_TOKEN_CAP by digest._enforce_cap, so the deliverable-sized default
# (GROQ_MAX_TOKENS) reserves ~45x what actually survives. Groq counts the whole
# reservation against TPM_LIMIT, so one map call alone exhausted the window and
# every following call was rate-limited into a backoff.
# 1500 leaves generous room for the cap plus low-effort thinking while letting
# several map calls share one window; it matches llm.MIN_COMPLETION_TOKENS, the
# floor the 413 halving path already refuses to go below.
#
# Do NOT lower this without testing against a DENSE document. The cap at
# SUMMARY_TOKEN_CAP is enforced AFTER generation by digest._enforce_cap, so it
# never constrains what the model emits — the reservation has to cover the full
# untrimmed FACTS/ENTITIES/CLAIMS block. A previous revision set this to 600
# based on a document whose chunks measured 386-406 tokens; a denser paper
# produced 470-496 token chunks and blew straight through it, and llm.chat
# raises on finish_reason="length" rather than returning a partial summary, so
# the whole transform failed at the map step.
MAP_COMPLETION_TOKENS = 1_500

# Reduce-step limits.
SUMMARY_TOKEN_CAP = 175

# Every number above and below derives from Groq's 8,000 TPM window, which is
# what the whole map-reduce architecture was built to survive. Gemini's window
# is ~250k TPM with a 1M-token context, so on that provider the binding limit
# is REQUESTS per minute, not tokens — and each map call is one more request.
# Chunking a document that fits in one context window is therefore pure added
# latency and pure added quota burn there.
#
# So the reduce-step ceilings scale with the provider: Groq keeps its original,
# carefully-derived values exactly (rollback safety), while Gemini gets limits
# sized to its own window.
_GEMINI = config.LLM_PROVIDER == "gemini"

# Maximum chunks the reduce step can hold. Groq: 14 (14 x 175 summary tokens
# ~= the 2,800-token reduce input budget, ~40 pages of source). Gemini: the
# reduce input is no longer the constraint, so this only bounds how many
# requests one job may spend.
MAX_CHUNKS = 60 if _GEMINI else 14
REDUCE_INPUT_TOKENS = 12_000 if _GEMINI else 2_800

# Below this, chunking is pure overhead — the source already fits one call.
#
# Groq: CHUNK_TOKENS (2,000), because prompt + completion must share one 8,000
# TPM window.
# Gemini: 200,000 — a deliberate safety margin under the 1M-token context and
# the per-minute token allowance, leaving room for the system prompt, the
# per-deliverable instructions and the completion on top of the source. Do not
# raise this without re-checking both limits.
FAST_PATH_MAX_TOKENS = 200_000
CHUNKING_THRESHOLD_TOKENS = FAST_PATH_MAX_TOKENS if _GEMINI else CHUNK_TOKENS

TPM_LIMIT = 8_000


class ChunkingError(Exception):
    """Raised instead of silently truncating. Requirement 6: a document that
    cannot fit fails loudly, naming the size and the specific budget."""


@dataclass
class Chunk:
    index: int      # 1-based, used as the attribution key through map+reduce
    text: str
    tokens: int


@dataclass
class ChunkSummary:
    """One chunk's map-step output. `index` is the attribution that must
    survive into the reduce step so contradictions stay traceable."""

    index: int
    text: str


@dataclass
class ChunkPlan:
    """What ingestion decided for this source. `chunked` False means the
    document fit in one call and the original text is used unchanged."""

    chunked: bool = False
    chunks: list[Chunk] = field(default_factory=list)
    total_tokens: int = 0

    @property
    def count(self) -> int:
        return len(self.chunks)


def estimate_tokens(text: str) -> int:
    """Word-count heuristic, floored by a character-based estimate.

    Word count alone is blind to text without spaces — a base64 blob or
    minified payload counts as one "word" and would be estimated at ~1 token
    while really costing thousands. Taking the max of the two estimates keeps
    the guards below honest for that input without needing a tokenizer."""
    by_words = len(text.split()) * TOKENS_PER_WORD
    by_chars = len(text) / CHARS_PER_TOKEN
    return int(max(by_words, by_chars))


def _split_points(text: str) -> list[str]:
    """Separators tried in order, coarsest first — a chunk boundary should
    land between paragraphs before it lands mid-sentence."""
    return ["\n\n", "\n", ". ", " "]


def _hard_units(text: str) -> list[str]:
    """Split into paragraph units. A single unit larger than the map ceiling
    is the pathological case requirement 6 names."""
    return [p for p in re.split(r"\n\s*\n", text) if p.strip()]


def plan_chunks(text: str) -> ChunkPlan:
    """Split `text` into overlapping, token-budgeted chunks.

    Raises ChunkingError when the document cannot be served — either an
    indivisible unit exceeds one map call's ceiling, or the chunk count
    exceeds what the reduce step's input budget can hold. These are
    different failures and are reported as such.
    """
    total = estimate_tokens(text)

    if total <= CHUNKING_THRESHOLD_TOKENS:
        return ChunkPlan(chunked=False, total_tokens=total)

    # ── Guard 1: an indivisible unit too large for any map call ───────────
    for unit in _hard_units(text):
        unit_tokens = estimate_tokens(unit)
        if unit_tokens > MAP_CHUNK_CEILING_TOKENS and not _is_splittable(unit):
            log.error(
                "[chunking][map-budget] indivisible unit of %d tokens exceeds "
                "the %d-token map-call ceiling",
                unit_tokens, MAP_CHUNK_CEILING_TOKENS,
            )
            raise ChunkingError(
                f"a single unbroken passage of {unit_tokens:,} tokens "
                f"({len(unit):,} characters) exceeds the map-step budget of "
                f"{MAP_CHUNK_CEILING_TOKENS:,} tokens per chunk (derived from the "
                f"account's {TPM_LIMIT:,} tokens-per-minute Groq limit). It contains "
                "no paragraph or sentence break to split on. Reformat the document "
                "with paragraph breaks, or split it before upload."
            )

    chunks = _window(text)

    # ── Guard 2: too many chunks for the reduce call's input budget ───────
    if len(chunks) > MAX_CHUNKS:
        needed = len(chunks) * SUMMARY_TOKEN_CAP
        log.error(
            "[chunking][reduce-budget] %d chunks would need %d summary tokens, "
            "over the %d-token reduce input budget (max %d chunks)",
            len(chunks), needed, REDUCE_INPUT_TOKENS, MAX_CHUNKS,
        )
        raise ChunkingError(
            f"document is {len(text):,} characters (~{total:,} tokens), which splits "
            f"into {len(chunks)} chunks — more than the {MAX_CHUNKS}-chunk maximum. "
            f"Their summaries would need ~{needed:,} tokens, over the "
            f"{REDUCE_INPUT_TOKENS:,}-token reduce-step input budget (derived from the "
            f"account's {TPM_LIMIT:,} TPM Groq limit). The supported ceiling is about "
            f"{MAX_CHUNKS * CHUNK_CHARS:,} characters (~40 pages). Split the document "
            "and run it as separate transforms."
        )

    log.info(
        "[chunking] %d chars (~%d tokens) -> %d chunks of ~%d tokens, %d%% overlap",
        len(text), total, len(chunks), CHUNK_TOKENS, int(OVERLAP_RATIO * 100),
    )
    return ChunkPlan(chunked=True, chunks=chunks, total_tokens=total)


def _is_splittable(unit: str) -> bool:
    """True when the unit contains any separator finer than a paragraph."""
    return any(sep in unit for sep in ("\n", ". ", " "))


def _window(text: str) -> list[Chunk]:
    """Overlapping windows over the text. Each window is cut back to the
    cleanest separator available near its end so entities and claims aren't
    severed mid-sentence; the next window starts OVERLAP_CHARS earlier so a
    claim spanning a boundary appears whole in one of the two."""
    chunks: list[Chunk] = []
    start = 0
    n = len(text)

    while start < n:
        end = min(start + CHUNK_CHARS, n)
        piece = text[start:end]

        if end < n:
            # Look for a break in the last 20% of the window.
            tail_from = int(len(piece) * 0.8)
            window = piece[tail_from:]
            for sep in _split_points(text):
                idx = window.rfind(sep)
                if idx != -1:
                    piece = piece[: tail_from + idx + len(sep)]
                    break

        piece = piece.strip()
        if piece:
            chunks.append(Chunk(index=len(chunks) + 1, text=piece, tokens=estimate_tokens(piece)))

        if end >= n:
            break
        advance = max(len(piece) - OVERLAP_CHARS, 1)
        start += advance

    return chunks
