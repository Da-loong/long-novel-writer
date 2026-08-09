# Feedback-to-rule compilation study

- Date: 2026-08-09
- Target: turn reader observations such as “像作文、不像网文、没有追读欲”
  into a durable Fanqie production constraint rather than a handoff note.
- Boundary: this repository independently implements the table parser, JSON
  compiler, context integration, cold-reader schema checks, transaction call,
  tests, and documentation. No external code, prompts, or prose are included.

## Public mechanisms assessed

| Source | Mechanism | Local adaptation |
|---|---|---|
| [larashero3-dotcom/writing-dna-skill](https://github.com/larashero3-dotcom/writing-dna-skill) | Distills a sample corpus into explicit reusable rules for language, structure, material, and viewpoint rather than relying on a vague “imitate this style” request. | Compile actual reader feedback into bounded project rules; retain raw feedback and its source row for audit. |
| [ibuildwith-ai/cody-article-writer](https://github.com/ibuildwith-ai/cody-article-writer) | Treats style guides as reusable assets used at different stages of writing and editorial review, with revision preserving the original draft. | Inject the same compiled rule set into context, drafting, revision, and cold-reader review without adding an article workflow or UI. |
| [mrigankad/Novel-OS](https://github.com/mrigankad/Novel-OS) | Uses structured agent outputs and blocks approval when a quality gate fails. | Require an exact cold-reader check for each due feedback rule; a failed check prevents a pass verdict and triggers the existing bounded repair loop. |

## Channel disposition

The current GitHub sources provided inspectable mechanisms. The current X and
YouTube result sets contained demonstrations and general evaluation discussion,
but no source-inspectable, Fanqie-relevant feedback-to-rule contract. This pass
adds no rule or code from those channels.

## Design decision

`state/feedback-ledger.md` stays human-readable and append-only. Its derived
counterpart `state/feedback-rules.json` is rebuildable and carries only active,
actionable entries. Rules guide prose immediately; the `复验章节` field controls
when an independent cold reader must explicitly check them.
