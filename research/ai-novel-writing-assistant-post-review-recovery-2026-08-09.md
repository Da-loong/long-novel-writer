# AI-Novel-Writing-Assistant post-review recovery extraction

- Source: https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant
- Reviewed commit: `91ef5b4a2032b96f579f0bc22ff50a560c6e1f6c`
- Reviewed on: 2026-08-09

## Mechanism observed

The upstream release notes describe reusing a successful chapter quality-gate
result for the same chapter and same prose after cancellation, failure, or
restart. It also distinguishes reusable, accepted work from unresolved quality
debt so a resume does not suppress a necessary re-review.

Relevant source material:

- `docs/releases/release-notes.md` (2026-05-01 and 2026-06-04 entries)
- `server/src/services/novel/quality/ChapterQualityLoopService.ts`
- `server/src/services/novel/director/runtime/DirectorQualityLoopBudgetLedgerService.ts`

## Fit assessment

The local skill had durable prompts and an abort ledger, but it discarded a
good chapter and repeated its cold read whenever a later fact-extraction call
briefly failed. Copying the upstream database/worker implementation would add
unneeded infrastructure and make a portable file-first skill harder to run.

## Adopted extraction

The native adaptation is `state/post-review-checkpoint.json`. It is created
only after deterministic gates and an accepted cold-reader receipt. It binds
the active transaction, chapter-card hash, manuscript SHA-256, and report SHA
relationship. Only a transient `mvp-fact-extract` process failure may retain
it. A retry then skips Draft A and the duplicate cold-reader call.

The runner verifies every binding before reuse. Any drift uses the established
abort/quarantine/fresh-draft path; successful commit deletes the ephemeral
checkpoint but preserves retention/resume events in the autopilot ledger.
