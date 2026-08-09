# Scene-delivery evidence study

- Date: 2026-08-09
- Purpose: prevent a chapter beat from being treated as delivered when the
  manuscript reads as an outline, a composition, or a chronological log.
- Boundary: this repository implements its own JavaScript, report schema,
  prompts, tests, and documentation. No upstream code, prompts, or prose are
  copied.

## Public mechanisms assessed

| Source | Mechanism observed | Local decision |
|---|---|---|
| [modoojunko/awesome-novel-agent](https://github.com/modoojunko/awesome-novel-agent) | Scene cards organize what the protagonist wants, what blocks that want, and what suspense compels the next scene. | Make those scene legs reader-verifiable after drafting: goal, obstacle, turn, and hook. |
| [ExplosiveCoderflome/AI-Novel-Writing-Assistant](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant) | Its current chapter contract explicitly carries reader question, visible reward, immediate desire, obstacle, turn, emotional/information change, net change, and end hook. | Add a binding reader-experience contract to the chapter card and require literal mini-payoff evidence, so a hook alone cannot impersonate chapter delivery. |
| [OGiNG/Novel-OS](https://github.com/OGiNG/Novel-OS) | Structured output contracts separate generation, checking, and persistence. | Use a strict normalized JSON reader report that can be hashed, audited, and rejected on schema or evidence failure. |
| [LiPu-jpg/Openwrite](https://github.com/LiPu-jpg/Openwrite) | Persisted review records connect evidence, severity, reviewed revision, and deltas. | Continue hash-bound chapter review records and feed the missing scene legs into a bounded repair brief. |

## Implemented contract

1. The independent cold reader quotes proof from the manuscript for each of the
   five scene legs: `goal`, `obstacle`, `turn`, `payoff`, and `hook`.
2. When a leg is absent, the report records `status: "missing"` and an
   explanation. A payoff must show an actual result, answer, gain/loss,
   relationship/resource shift, or actionable new fact; it does not infer
   delivery from the outline or chapter card.
3. `chapter-reader-review.js` validates each present quote against the current
   manuscript body, writes `scene_missing`, and rejects a `pass` report with
   unresolved legs.
4. The repair brief names each missing leg. Candidate selection favors fewer
   missing legs before lower-score and score-gain tie breaks.

This is a scene-delivery gate for Fanqie-oriented mobile serial prose. It is not
an invitation to add more outline material or generic literary evaluation.

## Channel disposition for this pass

- GitHub produced directly actionable, source-inspectable chapter-contract and
  control-plane mechanisms; the implementation above adopts only the bounded
  Fanqie-compatible portion.
- Current X-indexed results did not expose a source-inspectable AI-fiction agent
  workflow beyond generic claims, so this pass adds no X-derived rule.
- Current YouTube-indexed results were demonstrations or promotional material
  without a verifiable open workflow artifact, so this pass adds no
  video-derived rule.
