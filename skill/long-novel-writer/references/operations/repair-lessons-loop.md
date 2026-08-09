# Repair lessons loop

`repair-lessons.js` turns only cross-chapter recurring keys from `state/repair-debt-ledger.json` into a small evidence-derived lesson set. A single failed revision is never promoted. Each lesson retains its key, affected chapters, recurrence count, and a bounded drafting focus.

The transaction refreshes and hashes `state/repair-lessons.json`, then carries it into the chapter card and critical context. It is an advisory production constraint: the chapter card, Canon, reader/platform contracts, and literal-evidence gates remain binding.

```powershell
node scripts/repair-lessons.js update <PROJECT> --chapter 12
node scripts/repair-lessons.js audit <PROJECT>
```
