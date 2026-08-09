# Foreshadowing evidence reconciliation

`outline/foreshadowing-ledger.md` is the planned schedule. It never becomes
proof that a setup or payoff appeared in published prose. The derived runtime
file `state/foreshadowing-progress.json` reconciles that schedule with the
literal-evidence facts from accepted chapter ledgers.

## Contract

1. The fact extractor uses `hook_open` for an on-page setup or reinforcement
   and `hook_closed` for an on-page payoff.
2. Its `subject` is the exact ID from the plan ledger, such as `F-01`.
3. Each fact already carries a literal manuscript excerpt and source hash.
4. The reconciler records observed setup, reinforcement, closure, unknown IDs,
   and overdue items without editing the planning ledger.
5. An active item whose payoff deadline has arrived without accepted-page
   closure evidence blocks the chapter commit. Missing planned setup or
   reinforcement remains a visible warning for the next chapter context.

## Manual inspection

```powershell
node scripts/foreshadowing-reconcile.js update <PROJECT> --chapter 42
```

The autopilot executes the same reconciliation immediately after fact
extraction, before it advances project state. It snapshots the derived progress
file with the chapter fact report and ledger, so a failed post-gate restores the
previous complete state.
