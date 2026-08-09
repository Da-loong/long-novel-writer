# AuthorAgent: recurring repair lessons integration

- **Source:** https://github.com/Ckokoski/AuthorAgent
- **Reviewed commit:** `47e9570fb96b9d151a3b1f9c22e3a365eab9bd9c`

## Extracted mechanism

AuthorAgent aggregates repeated review and contradiction findings into durable, deduplicated lessons. A recurrence count, stable pattern key, and provenance prevent one flawed pass from becoming a permanent instruction.

## Adopted

`repair-lessons.js` reads the existing repair-debt ledger and promotes only debt keys that recur across at least two chapters. It writes a small hash-bound artifact with the affected chapters and actionable focus, which the transaction, chapter card, and context pack share.

## Excluded

The dashboard, provider routing, app database, broad marketing/publishing integrations, and upstream prompts are outside the portable Fanqie writing skill. No upstream code or prose was copied.
