# Repair-debt attribution loop

## Purpose

Keep the failed cold-reader evidence that a later accepted revision would
otherwise hide. This is a process diagnostic, separate from the committed
chapter quality trend.

## Evidence and categories

`repair-debt-ledger.js` reads only saved chapter-reader review artifacts. For a
chapter with at least one `should_revise: true` round, it records failed debt
keys from literal-evidence issue codes, low score dimensions, missing scene
legs, feedback/style/character/editorial/hook checks, and the final outcome.

The deterministic primary categories are:

| Category | Meaning |
|---|---|
| `repair_loop` | The same debt survives consecutive failed review rounds. |
| `contract_delivery` | A repeated scene-leg or delivery-boundary debt shows the assigned beat is not landing on page. |
| `diagnostic_drift` | A rewrite clears no original debt and changes to an unrelated failure category. |
| `budget_exhausted` | The final reader report still requires revision after the configured revision budget. |

## Runtime contract

```powershell
node scripts/repair-debt-ledger.js update <PROJECT> --chapter <NEXT_CHAPTER>
node scripts/repair-debt-ledger.js audit <PROJECT>
```

The update writes:

- `state/repair-debt-ledger.json` — full multi-round receipt;
- `state/repair-debt-guidance.json` — compact next-attempt diagnosis.

The transaction refreshes and freezes both files before context assembly. The
runner refreshes them after a chapter commits and after a failed chapter
attempt, so a retried transaction sees the exact recurring debt rather than a
generic retry prompt. The guidance is advisory: it cannot change the chapter
card, accepted Canon, reader/platform contract, or literal-evidence gates.

## Interpretation

Use `contract_delivery` to strengthen the current scene contract, not to add
new plot. Use `repair_loop` to target the original evidence debt exactly. Use
`diagnostic_drift` to keep revisions narrow. A `budget_exhausted` result is a
production stop diagnosis, not a license to accept failing prose.
