# Hook-debt agenda loop

## Purpose

`state/foreshadowing-progress.json` records what the accepted manuscript has
actually established. `hook-agenda.js` turns that record into a bounded
next-chapter obligation. It does not edit the outline ledger or declare a
promise delivered: it only selects the oldest observable debt that the next
chapter must move.

The agenda is regenerated at `chapter-transaction begin`, frozen with the
transaction hash, included in the critical context packet, then regenerated
from accepted fact extraction after commit. The next cold-reader report must
prove every `must_advance` item with a literal prose excerpt.

## Writer behavior

For a due hook, prose must add one of these on-page changes:

- an escalation that raises a concrete cost or deadline;
- a new usable clue or contradictory evidence;
- a consequence that changes character options or resources; or
- a bounded payoff that closes or materially transforms the promise.

Repeating the hook name, mentioning it in exposition, or ending with a vague
teaser does not clear the obligation. Avoid opening sibling mysteries while a
stale hook remains due.

## Commands

```powershell
node "$skill\scripts\hook-agenda.js" update .\BOOK --chapter 12
node "$skill\scripts\context-pack.js" build .\BOOK --chapter 12 --query "hooks"
```

Default policy: a hook becomes stale after ten chapters without observed
movement; at most two obligations are surfaced per chapter. The policy appears
inside `state/hook-agenda.json`, which is the audit record for that decision.

## Review and revision

The cold-reader JSON schema 1.5 has one `hook_agenda_checks` record for every
due ID. Each record carries literal evidence. A failed check forces the
chapter into the existing revision transaction and becomes a scored candidate
selection dimension; a rewrite that adds new hook debt is rejected.
