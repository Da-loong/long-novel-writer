# Cross-chapter pacing ledger study

- Date: 2026-08-09
- Scope: sustain reader momentum across a long Fanqie serial without turning
  prose into a mechanical beat formula.
- Boundary: this repository independently implements its JavaScript, schema,
  prompts, tests, and documentation. No upstream code, prompts, or prose are
  included.

## Sources and extraction

| Public source | Observed mechanism | Local adaptation |
|---|---|---|
| [modoojunko/awesome-novel-agent](https://github.com/modoojunko/awesome-novel-agent) | Tracks hook health, volume boundary, and warns when high pressure or flatness persists across chapters. | Persist a small reader-labelled history and issue advisory variety/release warnings. |
| [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) | Tracks narrative lines and hook-type history to reduce structural repetition in automatic serial generation. | Track the primary hook and visible payoff type only after the final reader report matches the committed prose hash. |
| [jiejingta/inkos-auto](https://github.com/jiejingta/inkos-auto) | Keeps author intent/current focus separate from compiled runtime context and durable truth files. | Put the ledger in the next chapter's critical context while leaving chapter card, Canon, and current focus authoritative. |

## Implemented boundary

The ledger uses four non-blocking warnings: repeated hook type, repeated payoff
type, sustained high pressure, and a release gap. It never counts planned beats
as delivered and never rewrites a committed chapter simply to satisfy a rhythm
pattern. Only a final `pass` review whose manuscript hash matches the current
chapter can create a history entry.

## Channel disposition

GitHub yielded directly inspectable mechanisms above. This X-indexed and
YouTube-indexed pass surfaced generic commentary or demonstrations rather than
a source-verifiable open fiction workflow; no rule or code was adopted from
those channels.
