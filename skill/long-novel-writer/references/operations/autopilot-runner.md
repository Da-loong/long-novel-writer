# Autopilot runner

`autopilot-runner.js` is the executable bridge for a single-start production
run. It combines the frozen workflow manifest, chapter transactions, local
context packs, deterministic gates, blind-reader evidence, review slices and
handoff. It never treats an agent response as a committed artifact until the
file exists and its gate has passed.

## Commands

```powershell
node scripts/autopilot-runner.js start <PROJECT>
node scripts/autopilot-runner.js run <PROJECT> --model "MODEL" --max-chapters 4
node scripts/autopilot-runner.js status <PROJECT>
node scripts/autopilot-runner.js stop <PROJECT> --code OPERATOR_PAUSE --reason "..."
```

The model is selected by `settings/agent-runner.json`, `--model`, or
`LNW_AGENT_MODEL`. The executable is selected by `agent_command`,
`--agent-command`, or `LNW_AGENT_COMMAND`; this keeps Claude, a local adapter,
or another CLI interchangeable. Timeouts, retry limits, chapter range, panel
attempts, review interval and adapter flags (`agent_args`) are persisted in the
project config.

## Durable behavior

1. `start` freezes the workflow manifest and creates
   `state/autopilot-run.json` plus `state/autopilot-run-ledger.jsonl`.
2. Preparation nodes run in order: `build`, `character`, `story-plan`, and
   `outline`. Each attempt stores its prompt and transcript in
   `state/agent-runs/`; a missing artifact or failed process consumes one
   retry and leaves the previous checkpoint intact.
3. Each chapter is wrapped by `chapter-transaction begin -> chapter card ->
   Draft A -> deterministic checks + cold-reader report -> bounded Draft B/C
   repair -> candidate selection -> quality checks -> finish -> post-hoc`.
   Every repair receives a versioned brief and snapshot. A candidate is retained
   only when its measurable quality or reader debt improves; a plateau restores
   the prior draft. State is advanced only around the post gate; a failed post
   gate restores the previous project state and records an aborted transaction.
4. Before chapter 4 in a 300k+ project, three independent cold-reader sessions
   produce raw reports. The runner synthesizes evidence with verifiable quotes
   and invokes the existing pilot gate. A weak panel pauses production and
   stores the reports; a bounded repair pass may rewrite chapters 1-3 before a
   second panel attempt.
5. Every `review_interval` chapters, a cross-chapter review artifact is
   required. Reaching `target_words` writes `state/handoff-current.md` and
   changes both runtimes to `complete`/`completed`.

The runner respects pilot rejection, paused supervision, locked canon and the
pilot thresholds. A stop is a state transition, not a log message: the exact
code, reason, current chapter, word count and latest agent transcript remain
queryable through `status`.
