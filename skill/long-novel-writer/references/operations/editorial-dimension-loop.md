# Focused editorial-dimension loop

## Purpose

This is the Openwrite-derived quality layer adapted for a file-first Fanqie
serial workflow.  It does not import a Studio, web application, or an
unbounded 37-item checklist.  It carries the eight failure-prone dimensions
that most often make a long web-novel chapter feel like an outline, a summary,
or a character puppet.

## Contract

The unattended cold-reader prompt must return schema `1.4` with exactly one
literal-evidence check for each dimension in
`scripts/chapter-reader-review.js:EDITORIAL_DIMENSIONS`:

| ID | Decision question |
|---|---|
| `character_consistency` | Does the on-page choice agree with the character's goal, pressure, and current state? |
| `information_boundary` | Is the POV acting only on earned information and reasonable inference? |
| `causal_chain` | Do goal, resistance, choice/turn, and result connect causally? |
| `outline_delivery` | Does the chapter dramatize its assigned beat rather than replace it with a summary? |
| `dialogue_tension` | If dialogue occurs, does it change leverage, conflict, evasion, or relationship? |
| `action_over_summary` | Are key changes acted out through action, reaction, and consequence? |
| `canon_continuity` | Do on-page facts agree with the local canonical packet? |
| `next_read_boundary` | Does the ending create a concrete next question without prematurely spending a later resolution? |

`dialogue_tension` may be `not_applicable` only when the chapter has no
dialogue.  Every other dimension needs `pass` or `fail`, a concise note, and a
contiguous literal manuscript quote.  A `fail` forces the current transaction
into bounded revision; the candidate comparison also prefers fewer editorial
failures before it considers score movement.

## Why this is not a generic scorecard

A broad review number can be high while an assigned beat is skipped, a lead
acts on unavailable knowledge, or the final hook consumes the next chapter's
payoff.  These checks bind the evaluator to exactly those evidence-bearing
questions.  Deterministic format, repetition, fact, foreshadowing, pacing,
style, and character-contract gates remain separate and continue to run.

## Inspection

```powershell
node scripts/chapter-reader-review.js validate <PROJECT> --chapter <N> --file <REPORT.json>
```

Read the saved `editorial_dimension_checks` and
`editorial_dimension_failures` in the report or its chapter QA record.  Do not
turn a failed editorial check into an outline note: repair the manuscript,
re-run the cold reader, and preserve the transaction's canon snapshot.
