# Cross-chapter pacing ledger

The pacing ledger keeps an evidence-backed history of actual reader-labelled
chapter shapes. It prevents a long Fanqie serial from repeating the same
cliffhanger or reward pattern just because every individual chapter passes.

## Input contract

Every accepted cold-reader report supplies three labels after it has inspected
the prose:

- `pressure`: `setup`, `rising`, `high`, or `release`;
- `hook_type`: `risk`, `reveal`, `choice`, `deadline`, `reversal`,
  `relationship`, `resource`, or `mystery`;
- `payoff_type`: `answer`, `win`, `loss`, `resource`, `relationship`,
  `information`, `survival`, or `progress`.

`scripts/pacing-ledger.js update` accepts only a `pass` report whose
`manuscript_sha256` equals the committed manuscript. Rejected revision reports,
stale reports, and planned chapter beats never enter the history.

## Advisory health checks

The ledger records warnings instead of imposing a formula on a live serial:

1. three or more identical hook types;
2. three or more identical payoff types;
3. four or more consecutive `high` pressure chapters;
4. five recent chapters with three or more `high` pressure labels and no
   `release` chapter.

Warnings become factual context for the next chapter. The writer must vary the
reader question or visible reward while keeping the binding beat and Canon; it
does not rewrite a completed chapter merely to satisfy a pattern counter.

## Runtime

`autopilot-runner.js` updates `state/pacing-ledger.json` after a chapter passes
its cold-reader and transaction gates. The next transaction carries that file in
the critical context tier.

```powershell
node scripts/pacing-ledger.js audit <PROJECT>
node scripts/pacing-ledger.js update <PROJECT> --chapter 12
```

The JSON records report/manuscript hashes, labels, compact scores, warnings, and
recommendations. It is included in `project-audit.js` manifests.
