# Agent and skill practices: iteration 2026-08-09

## Scope and source sweep

This pass searched current GitHub repositories, X-indexed public posts, YouTube-indexed results, and community discussion for AI fiction, serial fiction, and writing-agent practice. The target remains a local, file-backed skill for Fanqie web-novel production.

| Surface | Evidence assessed | Extraction decision |
|---|---|---|
| GitHub, focused chapter workflow | [HZ-KMNO/web-novel-writing-guidance-skill](https://github.com/HZ-KMNO/web-novel-writing-guidance-skill), commit `24dd6d40099c97c3120dc37942e8dc99263c0259`, MIT | Adopt durable chapter task card, character information boundary, and A/B/C draft separation. |
| GitHub, large skill package | [worldwonderer/oh-story-claudecode](https://github.com/worldwonderer/oh-story-claudecode), commit `70a834e88d1103f494f45667bab4b31472a83b58`, MIT | Retain contract testing and explicit phase boundaries; existing skill already covers scan, breakdown, context, and cross-book recall. |
| GitHub search | Public repository result set: serial drafting, state recovery, reader panels, style de-AI processing, and chapter blueprints | Favor mechanisms that create a project artifact or an executable check over prompt-only claims. |
| X indexed post | [Leo Grundstr?m?s workflow thread](https://x.com/grundstromleo/status/2036909231195251002) | The transferable point is outline-to-scene specificity: treat a script as a narrated sequence with concrete visual beats, then review and add specific details. It supports a scene contract rather than generic prose expansion. |
| YouTube indexed results | Query set: AI novel-writing agent workflow and Chinese AI novel writing workflow | The returned results lacked a verifiable, novel-agent-specific operational artifact. This batch introduced no video-derived platform rule. |
| Community discussion | [Hacker News discussion of a complete AI-book generator](https://news.ycombinator.com/item?id=46572593) | Treat finished reader-facing samples and reader-time respect as stronger evidence than speed or one-click completion claims. Existing pilot gates remain aligned. |

## Integrated implementation

The following independent implementation is now part of the skill:

1. `scripts/chapter-card.js` builds a hash-backed chapter contract from the existing beat, active state, due foreshadowing, and POV knowledge row.
2. `chapter-transaction begin` creates and locks the card, then places it in the critical context tier.
3. The chapter prompt instructs the drafting agent to follow the card?s scene delivery and information boundary.
4. `autopilot-runner` now runs bounded Draft B and Draft C repair passes after a deterministic quality failure, records every agent transcript, and writes the repair history into chapter QA.

## Scope guard

The integration keeps the Fanqie focus: mobile-readable serial prose, early action, compact scene progression, visible reader payoff, end hooks, evidence-backed platform research, and a durable project ledger. GUI products, publication-site adapters, desktop runtimes, and model-provider layers stay outside this skill.

## License and boundary

Both inspected repositories declare MIT licenses. This repository contains independent JavaScript, templates, and tests; no external source code, prompts, or prose examples were copied.
