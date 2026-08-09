# AI-Novel-Writing-Assistant repair-debt extraction

- Source: https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant
- Reviewed commit: `91ef5b4a2032b96f579f0bc22ff50a560c6e1f6c`
- Reviewed on: 2026-08-09

## Mechanism observed

The upstream project retains structured attribution when a chapter leaves its
quality loop with unresolved debt. Its no-LLM aggregation tool summarizes root
causes, failure issue codes, missing obligations, and a decision recommendation
across affected chapters. The important contribution is diagnostic separation:
a later pipeline action must not erase evidence about what the repair loop kept
failing to fix.

Relevant upstream files:

- `docs/wiki/workflows/quality-debt-attribution.md`
- `server/src/agents/tools/bookAnalysisTools.ts`
- `server/src/agents/tools/bookAnalysisToolSchemas.ts`

## Fit assessment

The source system's A/B/D/E labels are coupled to its patch-anchor and deferred
database pipeline, so they are not transplanted. The local skill already stops
on an unresolved quality gate and keeps all review rounds on disk; its gap was
that a successful final revision hid the recurring initial debt from future
first drafts, and a failed attempt had no compact retry diagnosis.

## Adopted extraction

Added `scripts/repair-debt-ledger.js`. It derives a durable receipt from local
reader-review reports only, producing `state/repair-debt-ledger.json` and
`state/repair-debt-guidance.json`. Its native categories are repair-loop,
contract-delivery, diagnostic-drift, and revision-budget-exhausted.

The guidance enters the transaction, context pack, chapter card, draft,
revision, scheduled review, post-hoc artifacts, and failed-attempt retry path.
It remains advisory and cannot bypass Canon, chapter-card, or reader gates.
