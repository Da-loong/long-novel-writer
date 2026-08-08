# Workflow runtime contract

The skill is a content system; `scripts/workflow-runner.js` supplies the missing
execution layer without requiring a desktop app or database. It freezes the
workflow definition at task start, records node attempts and artifact hashes,
and resumes from the first incomplete node.

## Commands

```powershell
node scripts/workflow-runner.js start <PROJECT>
node scripts/workflow-runner.js status <PROJECT>
node scripts/workflow-runner.js checkpoint <PROJECT> <NODE> --artifacts <FILE[,FILE...]>
node scripts/workflow-runner.js fail <PROJECT> <NODE> --reason "..."
node scripts/workflow-runner.js retry <PROJECT> <NODE>
node scripts/workflow-runner.js post-hoc <PROJECT> --chapter N --summary "..." --artifacts <FILE[,FILE...]>
```

`start` stores a manifest SHA-256 and an input snapshot in
`state/workflow-run.json`. A completed node is immutable; a retry only reopens
the failed node and leaves prior checkpoints untouched. `checkpoint` requires
real files and stores their SHA-256 values in `state/workflow-ledger.jsonl`.
`post-hoc` appends a chapter continuity record and is required before the next
chapter transaction.

`workflow-runner.js` remains the low-level manifest/checkpoint API. For a
single-start production run, `autopilot-runner.js` is the active bridge: it
invokes the configured agent, stores prompts/transcripts, verifies artifacts,
wraps each chapter in a transaction, and calls the low-level API. The bridge
does not accept a chat response as proof of completion; only a real file plus
the corresponding gate advances state. This separation keeps model work
flexible while making control flow, recovery and audit evidence reproducible.
