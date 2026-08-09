# Chapter fact ledger

The chapter fact ledger is the bridge between accepted prose and later context.
It avoids treating a free-form state-file update or a chapter outline as proof
that an event actually happened on the page.

## Sequence

1. Draft A/B/C and cold-reader review select the final manuscript candidate.
2. `mvp-fact-extract` reads that candidate and writes
   `analysis/chapter-facts-chXXXX.json`.
3. Every extracted fact gives its kind, subject, concise claim, and one exact
   manuscript quote. `scripts/chapter-facts.js validate` rejects missing,
   duplicate, oversized, or fabricated evidence.
4. The normalized report is mirrored to
   `state/fact-ledger/ch-XXXX.json` with manuscript and report SHA-256 values.
5. The next context pack includes the recent fact-ledger files in the hot state
   tier. Existing Canon files remain authoritative for planned rules and stable
   settings; the ledger is the evidence-bound record of newly established facts.

## Fact kinds

`event`, `character_state`, `location`, `resource`, `knowledge`,
`relationship`, `timeline`, `hook_open`, and `hook_closed` are available. A
fact records only a durable change established by the current chapter; it does
not predict a future beat or summarize author intent.

## Manual inspection

```powershell
node scripts/chapter-facts.js validate <PROJECT> --chapter 12 --file analysis/chapter-facts-ch0012.json
```

The autopilot uses the same command during its active chapter transaction. The
fact report and ledger are recorded in chapter QA, post-hoc artifacts, agent
run evidence, and `project-audit.js` manifests.
