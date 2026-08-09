# Durable long-context loop

## Story compass

`settings/author-intent.md` holds the durable book promise: reader reward, genre boundary, emotional payoff, and completion target. `state/current-focus.md` holds the current arc objective and the immediate delivery target. The first document changes rarely; the second moves after a committed chapter.

## Canonical context packet

`context-pack.js` rebuilds `state/context-pack.md` before each transaction. It uses this priority order:

1. critical compass, reader/platform contracts, target beat, current state, unresolved hooks, derived foreshadowing index, and the target resource window;
2. the recent manuscript window;
3. current character/timeline state and warm canon;
4. older relevant chapter capsules.

The embedded manifest contains source paths, representations, scores, truncation, and a per-tier character-budget report. The source files remain canonical; the pack is a rebuildable cache.

## Chapter memory and compression

A successful `chapter-transaction finish` writes `state/chapter-memory/ch-XXXX.json`. The capsule keeps bounded opening, turning, ending, source hash, and state snapshot references. When a cold chapter is retrieved later, the context pack selects this capsule while preserving the manuscript path and hash as the truth source.

```powershell
node scripts/chapter-memory.js validate <PROJECT> --chapter 12
```

## Foreshadowing index

`foreshadowing-index.js` derives a typed index from `outline/foreshadowing-ledger.md`. It validates identifiers and schedule order, reports due setup/reinforcement/payoff work for the target chapter, and records declared dependencies.

```powershell
node scripts/foreshadowing-index.js <PROJECT> --chapter 12 --write
```

`chapter-transaction begin` refreshes the index and places it in the context pack. Fix any reported index error before drafting. The ledger remains the editable source of truth.

## Hook-debt agenda

`hook-agenda.js` turns observed foreshadowing progress into a compact next-chapter obligation. It prioritizes stale promises, near payoff deadlines, and recently advanced hooks that are ready for resolution; it freezes no more than two `must_advance` IDs with the chapter transaction. The agenda joins critical context, and cold-reader schema 1.5 requires literal prose proof that each due ID received a concrete escalation, clue, consequence, or payoff.

`references/operations/hook-agenda-loop.md`

## Resource continuity window

Accepted chapter facts can carry a typed, literal-evidence resource delta. Before
each chapter, resource-ledger.js rebuilds the durable ledger and a bounded
state/resource-window.json for the target chapter. Drafting, cold reading,
and revision use this same window to preserve holder, availability, consumption,
concealment, loss, damage, and access facts. Stale or expected-use-due resources
become warnings, never invented plot events. Read
references/operations/resource-ledger-loop.md and update with
scripts/resource-ledger.js update <PROJECT> --chapter <N>.
