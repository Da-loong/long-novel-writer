# Concrete end-hook study

- Date: 2026-08-09
- Target: Fanqie serial chapters that create a real next-reading question
  instead of composition-like or AI-like future narration.
- Boundary: this repository independently implements the detector, prompts,
  tests, and documentation. No external source code, prompt text, or prose is
  included.

## Evidence assessed

| Source | Mechanism | Local decision |
|---|---|---|
| [conorbronsdon/avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) | Identifies short engagement fragments that manufacture momentum around ordinary information, and recommends structural rather than synonym-only checks. | Detect only highly specific generic-future teaser formulae in the final 700 characters; preserve ordinary scene dialogue elsewhere. |
| [番茄作家课堂执行归纳](../skill/long-novel-writer/references/platform/fanqie-writer-classroom-playbook.md) | The platform contract requires each chapter to move through goal, obstacle, action, result, and a credible end hook. | A valid hook must inherit a concrete result, decision, object, actor, place, deadline, or risk established by the chapter. |
| [modoojunko/awesome-novel-agent](https://github.com/modoojunko/awesome-novel-agent) | Scene cards tie suspense to the protagonist's desire and obstacle rather than generic prose escalation. | Reinforce the existing chapter-card and literal reader-evidence contract with a deterministic tail check. |

## Implemented rule

`format-gate.js` examines only the last 700 body characters. It reports a hard
`GENERIC_END_HOOK` error for a narrow set of empty teaser patterns, including
“真正的考验才刚刚开始” and “更大的危机还在后面”. The repair direction is concrete:
replace the teaser with a newly established actor, object, result, decision,
place, deadline, or risk.

The cold-reader prompt mirrors this rule: a generic teaser does not qualify as
`scene_evidence.hook`. The rule does not treat a generic word such as “危机”
inside the chapter body as a violation.

## Channel disposition

This GitHub pass supplied the adopted mechanism. Current X and YouTube indexed
results again lacked a source-verifiable open fiction workflow with a stronger
end-hook implementation, so they add no code or rule in this iteration.
