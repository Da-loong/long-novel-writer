# oh-story-claudecode: plot-unit integration

- **Source:** https://github.com/worldwonderer/oh-story-claudecode
- **Reviewed commit:** `70a834e88d1103f494f45667bab4b31472a83b58`
- **Local review snapshot:** `D:/tools/temp/source-review-oh-story-claudecode-20260809-r2`

## Extracted mechanism

The upstream long-form workflow places a bounded **plot unit** between volume planning and individual chapter outlines. A unit specifies a primary drive, setup, turn, payoff, and link to the next unit, preventing a volume promise from becoming disconnected chapter fragments.

## Adopted

- Add an editable, file-first `outline/plot-units.md` table.
- Derive a hash-bound, next-chapter `state/plot-unit-window.json` at transaction start.
- Carry the current unit and phase into the transaction, chapter card, and critical context pack.
- Treat malformed or overlapping units as a pre-draft transaction error; preserve compatibility for existing projects through visible missing/empty-plan warnings.

## Not adopted

- Upstream UI/workbench surface and its broader decomposition library: they do not improve the local skill's deterministic, artifact-first writing loop.
- Any source text, names, plot material, or prose examples: only the abstract planning mechanism was reused.
