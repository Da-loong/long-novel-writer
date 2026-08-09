# InkOS Auto mechanism review: hook-debt agenda

- Upstream examined: [jiejingta/inkos-auto](https://github.com/jiejingta/inkos-auto)
- Revision examined: `b6c631684f93a8c2013a75f4b2838099ef74274c` (`2026-08-09` local source review)
- Boundary: no source code, prompt text, or product assets are copied. This record captures an independently implemented orchestration pattern.

## Mechanism retained

The useful production mechanism is to treat unresolved promises as quantified
narrative debt rather than a passive planning list:

1. rank active hooks by staleness, deadline proximity, and resolution readiness;
2. surface only a small bounded agenda for the next chapter;
3. make an observed on-page change mandatory; and
4. retain the current manuscript when a repair does not reduce that debt.

## Local implementation

`skill/long-novel-writer/scripts/hook-agenda.js` rebuilds
`state/hook-agenda.json` from literal-evidence
`state/foreshadowing-progress.json`. `chapter-transaction begin` freezes its
hash and next-chapter IDs. The context packet, writer prompt, cold-reader
schema 1.5, revision brief, candidate comparator, and post-commit audit now
share that record.

This complements the Openwrite-derived long-context and transactional work:
Openwrite contributes the durable context and evidence architecture, while the
agenda prevents observed promises from staying unresolved merely because the
outline still lists them.
