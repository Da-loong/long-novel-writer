# AI-Novel-Writing-Assistant chapter-obligation extraction

- Source: https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant
- Reviewed commit: `91ef5b4a2032b96f579f0bc22ff50a560c6e1f6c`
- Reviewed on: 2026-08-09

## Mechanism observed

The upstream director distinguishes a generic draft-stage success from an
unfulfilled chapter obligation. Its 2026 release notes describe a shared
chapter obligation contract across planning, draft writing, acceptance, repair,
and re-planning; missed payoffs, character appearances, or target changes are
reported as the real execution gap rather than a generic writer failure.

Relevant upstream material:

- `docs/releases/release-notes.md` (2026-05-15 and 2026-07-14 entries)
- `server/src/services/novel/runtime/ChapterQualityGateService.ts`
- `server/src/services/novel/production/QualityRepairStageRunner.ts`

## Fit assessment

The local skill already has file-first chapter cards, hard Canon gates, a
cold-reader report, and bounded repairs. Its remaining gap was verification:
the reader could prove a generic goal/turn/payoff while missing the particular
assigned goal, turn, cost, new fact, emotional movement, or end hook.

The upstream system's database-backed patch/replan machinery is not adopted.
It would duplicate the local transaction and make a portable skill dependent on
runtime services.

## Adopted extraction

`chapter-card.js` now compiles seven `chapter_obligations`, and reader schema
`1.6` requires one literal-evidence `chapter_obligation_checks` entry for each.
Any failed entry becomes revision debt and is compared before score-only repair
promotion. This preserves the existing Fanqie-first short-scene format and
keeps the outline semantic rather than copying it into prose.
