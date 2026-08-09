# Plot-unit window

Use `outline/plot-units.md` as the original, editable layer between a volume outline and chapter beats. Each row has a non-overlapping inclusive chapter range plus the unit-level primary drive, setup, turn, payoff, and next promise.

At transaction start, `plot-unit-window.js` selects the row covering the next chapter and writes `state/plot-unit-window.json`. The window is carried into the chapter card and critical context tier so the active chapter can serve the unit without replacing its chapter beat. Setup, turn, and payoff are phase labels; the unit payoff is required only as guidance, never as a substitute for literal chapter-card and cold-reader evidence.

For imported or older projects, a missing or empty plan leaves the window disabled with a visible warning. Once a plan exists, invalid fields, duplicate IDs, reversed ranges, or overlapping ranges stop the transaction before drafting. A chapter outside all defined ranges remains visible as an unassigned warning.

```powershell
node scripts/plot-unit-window.js update <PROJECT> --chapter 12
node scripts/plot-unit-window.js audit <PROJECT>
```
