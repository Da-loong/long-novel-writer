# Openwrite review-loop extraction

- Upstream: [LiPu-jpg/Openwrite](https://github.com/LiPu-jpg/Openwrite)
- Revision checked: `924f0cf` on 2026-08-09
- License: Apache-2.0
- Scope: architectural study only. This project uses independently written
  JavaScript, schemas, prompts, tests, and documentation.

## What was retained

Openwrite separates cheap deterministic checks from a deeper review stage and
persists normalized review records with evidence, severity, source revision,
and review deltas. Its reviewer enumerates continuity, pacing, voice, reader
expectation, AI-tell, and canon dimensions; its store attaches a hash of the
reviewed manuscript. Those are durable ideas for unattended production.

## What changed in this skill

This skill adds a single-purpose per-chapter cold-reader contract rather than a
general review product: five reader-facing dimensions: clarity, continuation, Fanqie fit, character
agency, and payoff; plus evidence-bound issues. The
validator rejects fabricated quotes and links every report to a manuscript
SHA-256. The runner feeds a failing report into the already-bounded Draft B/C
loop and records all rounds in chapter QA and the project evidence manifest.

## Deliberate exclusions

Openwrite's Studio, persistent database, model providers, session runtime,
full 37-dimension UI, and manual review interfaces are application concerns.
The skill remains file-first and executable from a local agent CLI.
