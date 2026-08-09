# Openwrite quality-trend extraction

- Source: https://github.com/LiPu-jpg/Openwrite
- Reviewed commit: `924f0cf134aacb73f943bfecf2ff53d62e5ebf2c`
- Reviewed on: 2026-08-09

## Mechanism observed

Openwrite separates confirmed writing assets from runtime state. Its rolling
planning service reads the recent drafted window, foreshadowing state, and
stored review issues, then exposes the next-window goals as a revision-bound
candidate. The Studio overview also presents review averages and system next
actions rather than treating a passing individual review as sufficient long-run
quality evidence. `tools/context_builder.py` keeps a documented priority order
and reports context compression instead of silently mutating source truth.

Relevant source files:

- `tools/rolling_planning.py`
- `tools/review_store.py`
- `tools/context_builder.py`
- `tools/chapter_pipeline.py`

## Fit assessment

Do not port the Studio, the two-agent chat layer, reference-library UI, or the
full broad review matrix. The local skill is file-first and already has a
transaction, focused literal-evidence reader review, chapter cards, and an
explicit context budget.

The missing high-value piece was a deterministic bridge from accepted
chapter-review history to the following chapter's craft focus. Per-chapter
minimum thresholds do not reveal a slowly declining continuation or Fanqie-fit
trend.

## Adopted extraction

Added `scripts/quality-trend-ledger.js` and its two durable artifacts:

- `state/quality-trend-ledger.json`
- `state/quality-guidance.json`

The implementation only reads final accepted cold-reader reports whose
manuscript hash matches the currently committed manuscript. It derives weak
dimension, trend, low-score streak, and a bounded craft recommendation. The
result is frozen into a new transaction, added to the critical context tier and
chapter card, then refreshed after commit with rollback coverage.

This is not an auto-rewrite authority and does not replace the binding chapter
beat, platform/reader contract, or Canon locks.
