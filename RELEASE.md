# Release checklist

1. Confirm `git status` contains only intentional source changes and no manuscript, token, Cookie, or live raw response.
2. Run `npm ci --ignore-scripts`, `npm run verify`, and `npm run release:check` on Node 20 or 22.
3. Inspect `evals/current.json`; every score must have current evidence, and no P0/P1 issue may remain open.
4. Run installer dry-run, then install to a temporary target and compare the reported source/installed SHA-256.
5. Review `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`, version strings, Firecrawl limitations, and official platform URLs.
6. Commit and push an annotated version tag only after the GitHub Actions Windows/Linux matrix passes.
7. Keep cloud credentials and timestamped raw ranking responses outside public commits unless explicitly sanitized.
