# Chapter card and revision loop

## Binding chapter card

Before a transaction starts, `chapter-card.js build <PROJECT> --chapter N` derives `state/chapter-cards/ch-XXXX.json` from the chapter beat, current character state, current focus, unresolved hooks, and due foreshadowing. The card carries:

- the POV, goal, obstacle, turn, cost, information gain, emotional movement, and end hook;
- a reader-experience contract: the central reader question, visible mini-payoff,
  end-state change, and end pull;
- the available POV knowledge when the character-state table records it;
- a three-scene delivery contract: entry pressure, escalation choice, payoff and next pull;
- source hashes and acceptance checks.

`chapter-transaction begin` refreshes it automatically, inserts it into the critical context tier, and freezes its hash in the transaction. The card is an execution contract; canonical sources remain editable only through the normal canon workflow.

## Draft A/B/C repair

The chapter agent drafts A first. Deterministic quality findings then choose bounded repair passes inside the same active transaction:

1. **Draft B / structure repair** fixes action delay, exposition blocks, beat delivery, causal movement, character information boundaries, and format findings.
2. **Draft C / language repair** handles remaining readability, dialogue-naturalness, repetition, and AI-pattern findings while preserving the card and canon.

`settings/agent-runner.json` controls the maximum with `chapter_revision_passes` (default `2`). Every invocation is saved in `state/agent-runs/`; the final `analysis/autopilot-qa-chXXXX.json` records its `revision_passes`. A chapter advances only after the final draft passes the deterministic gates and transaction finish.

```powershell
node scripts/chapter-card.js build <PROJECT> --chapter 12
node scripts/chapter-card.js validate <PROJECT> --chapter 12
node scripts/autopilot-runner.js run <PROJECT> --chapter-revision-passes 2
```
