# Evidence-bound chapter fact ledger study

- Date: 2026-08-09
- Target: preserve reliable facts through a Fanqie-scale long serial without
  expanding every future chapter prompt with unverified prose summaries.
- Boundary: this repository independently implements the extractor contract,
  JavaScript validator, context integration, tests, and documentation. No
  external code, prompts, or prose are included.

## Public mechanisms assessed

| Source | Mechanism | Local adaptation |
|---|---|---|
| [LiPu-jpg/Openwrite](https://github.com/LiPu-jpg/Openwrite) | Separates confirmed project truth from runtime files; its chapter flow extracts objective facts only after prose settles, injects bounded recent state into the next packet, and rolls prose plus state back together on a failed write. | Keep the existing Bible/outline as the confirmed planning layer; add a distinct fact ledger for accepted on-page events, inject only recent verified entries into hot state, and snapshot both report and ledger inside the existing chapter transaction. |
| [jiejingta/inkos-auto](https://github.com/jiejingta/inkos-auto) | An observer extracts chapter facts, a reflector emits structured deltas, and an auditor checks durable truth state. | Add an independent post-chapter extractor whose facts require exact source quotes and whose normalized delta becomes future context. |
| [worldwonderer/oh-story-claudecode](https://github.com/worldwonderer/oh-story-claudecode) | A chapter extractor produces summaries, plot points, and character mentions as a distinct unit from prose generation. | Keep fact extraction separate from writer and cold reader; retain only compact durable facts rather than a UI-facing analysis product. |
| [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) | Structured commit artifacts preserve replayable chapter facts and decisions. | Preserve report and manuscript SHA-256 values and include both source report and state ledger in post-hoc audit artifacts. |

## Deliberate limits

The ledger records only the currently accepted manuscript, never an outline,
rejected revision, model plan, or prediction. It is a recent evidence layer for
the next chapter, not a replacement for the book Bible, chapter card, or
human-readable Canon files.

## OpenWrite-to-skill extraction

OpenWrite is a complete application; this repository remains a file-first
skill. The extracted design is therefore deliberately narrow: one accepted
chapter produces one evidence-bound fact report and one hash-bound ledger
entry. The next chapter receives recent ledger entries as bounded context. The
existing transaction restores those two files along with prose and current
state if finalization fails. UI, model routing, vector infrastructure, and
manual confirmation surfaces are not copied into the skill.

## Channel disposition

GitHub supplied the source-inspectable mechanism. The current X and YouTube
result sets supplied general demonstrations rather than an auditable open
fiction fact-delta workflow, so this pass adopts no rule or code from them.
