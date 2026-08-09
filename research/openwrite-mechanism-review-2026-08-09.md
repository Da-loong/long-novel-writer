# Openwrite mechanism review — 2026-08-09

Source: https://github.com/LiPu-jpg/Openwrite (commit `924f0cf`, reviewed
2026-08-09).

## What transfers to this skill

| Openwrite mechanism | Existing skill state | Adopted increment |
|---|---|---|
| Confirmed `src/` versus runtime `data/` | Canon source files, derived state, hash-bound chapter transactions, evidence manifest | Retained; no second project model introduced. |
| Bounded canonical packet and progressive long-context recall | `context-pack.js`, recent chapters, chapter capsules, critical state tiers | Retained; Openwrite's UI and embeddings are intentionally excluded. |
| Chapter write/review/state-settlement as one recoverable unit | `chapter-transaction.js`, snapshots, production ledger, fact extraction, foreshadowing reconciliation | Retained; revision selection already rolls back weaker candidates. |
| Multi-dimensional review | Existing reader scores and deterministic gates covered only part of failure surface | Added schema-1.4 evidence-bound eight-dimension editorial slice. |
| Reference-style source packs and reusable/source-bound separation | `evidence/sources`, style-signal adoption, `style-contract.js` | Retained; only adopted abstract signals reach prose. |
| Planning forecasts stored outside canonical assets | Evidence derivations and canon mutation lock already separate tentative planning from frozen chapter sources | Retained; no redundant forecast subsystem created. |

## Deliberately not transferred

Openwrite's Studio, model configuration UX, local vector database, CLI service
layer, and interactive proposal acceptance are product-layer concerns.  The
current project is a portable `SKILL.md` plus deterministic scripts for
unattended Fanqie serial production, so copying those layers would increase
surface area without improving a chapter's reader experience.

## Resulting production chain

`evidence → adopted style/character contracts → chapter card + frozen context
→ draft → deterministic gates + cold-reader dimensions → bounded repair → fact
settlement / capsule / pacing / foreshadowing evidence`
