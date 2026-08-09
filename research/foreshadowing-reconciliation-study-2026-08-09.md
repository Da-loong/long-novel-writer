# Foreshadowing reconciliation study

- Date: 2026-08-09
- Target: keep a Fanqie-scale serial from treating an outline checkbox as proof
  that a planted question has appeared or paid off in reader-visible prose.
- Boundary: this repository independently implements the JavaScript contract,
  validator, transaction integration, tests, and documentation. No external
  code, prompts, or prose are included.

## Public mechanisms assessed

| Source | Mechanism | Local adaptation |
|---|---|---|
| [Anshler/graphify-novel](https://github.com/Anshler/graphify-novel) | Separates a structured story Bible from a derived relationship layer; its status surface distinguishes open threads and unresolved setups from the broader manuscript graph. | Keep the existing file-based Bible and planned foreshadowing ledger. Derive a compact evidence progress layer instead of adding a graph database or a new interface. |
| [mrigankad/Novel-OS](https://github.com/mrigankad/Novel-OS) | Serializes per-agent state updates, keeps continuity reports, and makes failed quality gates stop approval. | Use an extractor report validated against literal chapter excerpts, then make a due-but-unproven payoff a pre-commit gate. |
| [leenbj/novel-creator-skill](https://github.com/leenbj/novel-creator-skill) | Uses a foreshadowing/state memory layer, chapter gates, and long-run retrieval to address unresolved plot threads. | Keep retrieval and planning already present; add the missing reconciliation between planned setup/payoff dates and final-manuscript evidence. |
| [LiPu-jpg/Openwrite](https://github.com/LiPu-jpg/Openwrite) | Treats accepted prose, objective facts, bounded later context, and write rollback as one durable chapter lifecycle. | Run reconciliation after evidence-bound fact extraction and snapshot the progress file in the same chapter transaction. |

## Design decision

The output is `state/foreshadowing-progress.json`, a rebuildable observation
file. It never rewrites `outline/foreshadowing-ledger.md` and does not infer a
payoff from a plan, a synopsis, or a model assertion. The next chapter reads the
progress report as critical context, while the plan remains editable by the
book-design flow.
