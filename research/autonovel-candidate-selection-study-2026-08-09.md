# Autonovel candidate-selection study

- Upstream: [NousResearch/autonovel](https://github.com/NousResearch/autonovel)
- Revision inspected: `d165f267a0ffd34f3b0a70a8a72ac38cb8e4a542`
- Date: 2026-08-09
- License status at the inspected revision: no top-level license file or license
  declaration was present.
- Boundary: this repository copies no upstream code, prompts, templates, prose,
  or assets. All JavaScript, schemas, tests, and documentation here are
  independently authored.

## Observed mechanisms

The upstream describes an autonomous fiction pipeline with independent
mechanical and model evaluation, revision briefs that state what to preserve and
what to repair, candidate keep/discard decisions, and a plateau condition for
repeated iterations. It also identifies a separation between chapter-level
evaluation and longer-range reader-panel assessment.

## Fanqie-skill integration

The useful transfer is a bounded local chapter selector rather than an open-ended
score chase:

1. Archive Draft A before any rewrite.
2. Turn evidence-bound reader findings plus deterministic results into a concise
   repair brief that preserves the chapter card, Canon, and mobile format.
3. Review the repaired candidate with the same exact-quote contract.
4. Keep it only when it reduces deterministic or reader debt, or materially
   raises the reader score.
5. On a plateau, restore the stronger draft and let the outer bounded attempt
   create a new candidate instead of accumulating destructive rewrites.

This directly targets the observed failure mode where a generic rewrite appears
to satisfy a formal instruction but reads flatter than the prior draft. The
existing Fanqie chapter transaction, independent cold-reader gate, pilot panel,
and periodic cross-chapter review remain the governing workflow.

## Channels reviewed this iteration

| Channel | Signal | Disposition |
|---|---|---|
| GitHub: `NousResearch/autonovel` | Measurable candidate selection and plateau stop | Integrated as local snapshots and selector |
| GitHub: `Ckokoski/AuthorAgent` | Persona beta-reader panel and staged revision | Existing pilot-panel and chapter-reader mechanisms already cover the transferable part |
| GitHub: `voocel/ainovel-cli` | Fact/instruction separation and replayable decisions | Existing transaction, ledger, and context artifacts already align |
| GitHub: `howells/fiction` | Structured reader-agent returns and synthesis | Existing strict JSON reports and QA summaries align |
| ClaudeWorkflows / Reddit | Readability editor and fresh-reader feedback loop | Supports the reader-review decision; no additional direct dependency |
| X search | No project-specific, source-inspectable writing-agent mechanism surfaced | No integration |
| YouTube search | General AI-novel demonstrations favored unverified one-shot generation | No integration; conflicts with evidence-bound chapter production |
