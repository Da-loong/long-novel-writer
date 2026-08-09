# Chapter-obligation evidence loop

## Purpose

The generic cold-reader scene check proves that a chapter has a goal, obstacle,
turn, payoff, and hook. It does not by itself prove that the prose delivered
the **specific** chapter beat instead of substituting a generic scene of the
same shape.

`chapter-card.js` therefore compiles seven binding obligations from the current
chapter-beat row:

1. goal;
2. obstacle;
3. turn;
4. cost;
5. information/payoff;
6. emotional movement;
7. end hook.

Each has a stable `beat_*` ID, phase, and human-readable obligation in
`state/chapter-cards/ch-XXXX.json`.

## Review and repair

The unattended reader uses schema `1.6` and must return exactly one
`chapter_obligation_checks` result for every card obligation. Both `pass` and
`fail` require a contiguous literal manuscript excerpt. `not_applicable` is
not permitted: a ready chapter card has already declared these obligations
binding.

A failed obligation makes `should_revise=true`, blocks a pass verdict, and
enters the deterministic revision brief. Candidate selection compares the
number of failed chapter obligations before score-only improvement, so a nicer
but less faithful rewrite is discarded. The repair prompt must deliver the
named obligation and keeps Canon, knowledge boundaries, and the rest of the
card fixed.

## Boundaries

The check does not demand word-for-word reproduction of the outline. The
independent reader judges semantic delivery, while the validator proves that
the judgement cites the actual submitted prose. It is a chapter execution
contract; it cannot alter the master outline, create a new Canon fact, or
override a failed continuity gate.
