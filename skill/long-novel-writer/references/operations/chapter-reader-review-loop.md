# Chapter cold-reader review loop

This is a pre-commit review loop for every autonomously produced chapter. It
keeps reader judgement distinct from prose generation and turns that judgement
into a reproducible file contract.

## Sequence

1. Draft A is written inside the active chapter transaction and passes the
   deterministic format, degeneration, AI-pattern, and reader-metric checks.
2. `mvp-reader-review` reads the manuscript, binding chapter card, contracts,
   context pack, and current state. It writes one versioned round report:
   `analysis/chapter-reader-review-chXXXX-rNN.json`.
3. `scripts/chapter-reader-review.js validate` checks the exact schema, score
   ranges, chapter identity, and that each issue quote literally occurs in the
   reviewed manuscript. The report stores that manuscript SHA-256.
4. A `revise` verdict, any critical issue, or a score below
   `chapter_reader_min_score` activates Draft B/C. The revision prompt receives
   both deterministic findings and the validated reader report.
5. Each revision receives a fresh cold-reader round. Only a passing final
   report plus deterministic quality can cross the chapter transaction post
   gate. QA stores a compact audit trail; report rounds remain separately
   hashable by `project-audit.js`.

## Configuration

`settings/agent-runner.json` defaults to:

```json
{
  "chapter_reader_review": true,
  "chapter_reader_min_score": 7,
  "chapter_revision_passes": 2
}
```

Turn the loop off only for a targeted diagnostic slice with
`--chapter-reader-review false`. It does not replace the independent three-reader
pilot panel before a large project advances beyond chapter 3, nor the periodic
cross-chapter review.

## Report contract

Required scores are `clarity`, `continuation`, `fanqie_fit`,
`character_agency`, and `payoff`, each from 0 through 10. Issues contain a
stable code, `critical` or `warning` severity, literal manuscript evidence,
and a repair instruction. The reviewer does not edit source files.
