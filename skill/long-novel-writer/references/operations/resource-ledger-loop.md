# Evidence-bound resource ledger

## Purpose

`state/resource-ledger.json` records only resource changes extracted from an
accepted chapter with a literal manuscript quote. It is for continuity-critical
resources in serial fiction: money or quotas, items, keys, abilities,
credentials, information, and relationship tokens. It is not an inventory of
every prop, a plan, or a speculative future state.

The writer receives the compact `state/resource-window.json`, not an unlimited
inventory dump. The window prioritizes resources held by the target chapter's
participants, then due, stale, and high-risk resources. This keeps a Fanqie
chapter readable while preserving the facts most likely to cause a “where did
that item/power/money come from?” break.

## Lifecycle

1. The fact extractor emits `kind: "resource"` only when the prose visibly
   acquires, uses, conceals, loses, damages, restores, transfers, or reveals a
   resource.
2. The record carries `holder`, stable `key`, type, action, resulting status,
   risk, optional expected-use chapter, and the literal evidence quote.
3. `resource-ledger.js` rebuilds the durable ledger and the next-chapter window
   at transaction start and again after accepted fact extraction.
4. Drafting, cold reading, and revision read the same window. A contradiction
   in holder, availability, consumption, concealment, loss, damage, or access
   is a critical continuity issue.

## Commands

```powershell
node "$skill\scripts\resource-ledger.js" update .\BOOK --chapter 12
node "$skill\scripts\context-pack.js" build .\BOOK --chapter 12 --query "resource"
```

The default stale threshold is twelve chapters. A stale or expected-use-due
record is a warning and context priority, not a fabricated forced payoff.
Unstructured old `resource` facts remain outside the new ledger and are reported
for cleanup; they never become hard continuity facts.
