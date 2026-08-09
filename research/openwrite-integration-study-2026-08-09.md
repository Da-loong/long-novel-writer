# Openwrite decomposition and skill integration

- Upstream examined: [LiPu-jpg/Openwrite](https://github.com/LiPu-jpg/Openwrite)
- Revision examined: `924f0cf` (`2026-08-09` local research clone)
- Upstream license: Apache-2.0
- Boundary: this repository uses independently written JavaScript, templates, and tests. No upstream code, prompt text, or interface assets are copied.

## Architecture observed

Openwrite separates durable creative direction from chapter execution, packages a bounded canonical context, compresses older chapters into memory records, maintains foreshadowing as a validated graph, and writes state through transactional checkpoints. Its Studio and model-provider layers serve the application product rather than a portable writing skill.

## Integration decision

| Openwrite concept | Skill implementation | Verification |
|---|---|---|
| Long-term intent plus near-term focus | `settings/author-intent.md` and `state/current-focus.md` created during project initialization | context-pack tier and autopilot chapter prompt |
| Bounded canonical context | priority-driven `context-pack.js` with source representations and budget report | continuity gate tests |
| Progressive chapter memory | `chapter-memory.js`; a successful commit produces an immutable capsule with source hash | unit test and transaction event |
| Chapter settlement observations | memory capsule additionally records hash-bound pointers to the validated fact ledger and cold-reader report, with only compact metadata | drift-detection unit test |
| Foreshadowing graph/checkpoint | `foreshadowing-index.js` derives nodes, dependency edges, schedule warnings, and due work from the existing ledger | unit test and transaction begin |
| Transactional state | existing chapter transaction now records the memory artifact and foreshadowing index hash | integration suite |

## Deliberately excluded

The Studio GUI, desktop launcher, database/server runtime, and model-provider adapters remain outside this skill. The result stays an installable local skill built from Markdown project files and Node scripts.
