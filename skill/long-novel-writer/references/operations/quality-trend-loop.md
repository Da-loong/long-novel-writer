# Evidence-bound quality trend loop

## Purpose

Convert only accepted, manuscript-hash-matched cold-reader reports into a
compact craft diagnosis for the next chapter. This prevents a long run from
repeating a weak reader experience merely because each individual chapter
cleared the minimum release gate.

## Runtime contract

`quality-trend-ledger.js update <PROJECT> --chapter <N>` rebuilds:

- `state/quality-trend-ledger.json`: accepted report receipt per chapter;
- `state/quality-guidance.json`: bounded next-chapter diagnosis.

The ledger records the five existing reader dimensions: clarity, continuation,
Fanqie fit, character agency, and payoff. It accepts a report only when that
report is `pass`, has `should_revise: false`, and its manuscript SHA-256 equals
the final active manuscript. Rejected revision reports and stale reports do not
enter the trend.

The diagnostic window is at most five accepted chapters. It names the weakest
dimension, weakest recent chapter, and a score decline only when six accepted
chapters make two non-overlapping three-chapter windows meaningful. A three-chapter score-at-or-below-7
streak in the same weak dimension is reported explicitly.

## Use in production

`chapter-transaction begin` refreshes and hash-freezes both files before it
builds the chapter card and context pack. Drafting and repair read the compact
guidance. After a chapter commits, the runner refreshes the ledger for the next
chapter and records both artifacts in the post-hoc lineage.

The guidance is advisory and craft-specific. It does not permit an agent to
change Canon, consume a later beat, invent a new conflict, or overwrite the
binding chapter card.

## Inspect

```powershell
node scripts/quality-trend-ledger.js audit <PROJECT>
node scripts/quality-trend-ledger.js update <PROJECT> --chapter <NEXT_CHAPTER>
```

When the trend declines, repair the named reader-experience dimension through
the already assigned scene. Do not add unrelated plot to chase an aggregate
number.
