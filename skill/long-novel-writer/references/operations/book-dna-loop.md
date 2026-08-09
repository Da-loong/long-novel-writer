# Multi-source Book DNA loop

Use this loop after ranking and breakdown, before fixing the book premise and outline.

1. Populate `evidence/derivations/benchmark-pool.md` with 10–20 same-track titles or anonymized IDs and their observable evidence.
2. Add reusable findings to `benchmark-feature-matrix.md` across `market`, `framework`, `plot`, `character`, `chapter`, `prose`, and `retention`.
3. Mark a finding adopted only when two or more benchmark IDs support it. Describe a mechanism, never source wording, names, scenes, plot sequences, settings, or character configurations.
4. Keep exclusions in `source-boundaries.md`, then compile the project contract:

```powershell
node scripts/book-dna.js compile <PROJECT>
```

`chapter-transaction begin` compiles this automatically, freezes its hash in the transaction, puts `state/book-dna.json` in critical context, and attaches applicable mechanisms to the chapter card. The original matrix remains the audit source; Book DNA cannot override canon, the reader contract, the platform contract, or a binding chapter beat.
