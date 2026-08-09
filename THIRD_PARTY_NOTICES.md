# Third-party notices

This repository's skill implementation, templates, and tests are original work released under MIT.

## Firecrawl

The optional online ranking workflow calls a separately operated Firecrawl API. Firecrawl itself is not bundled. Its core repository is published under AGPL-3.0; its cloud service has separate pricing and terms.

- Core: https://github.com/firecrawl/firecrawl
- API documentation: https://docs.firecrawl.dev/api-reference/endpoint/scrape
- Self-hosting: https://github.com/firecrawl/firecrawl/blob/main/SELF_HOST.md

The research clone of `firecrawl/cli` was used only to inspect public interface and testing conventions. No code is copied into this repository.

## Openwrite

The public Openwrite repository was reviewed for architectural comparison at revision `924f0cf`. Its Apache-2.0 license is retained by the upstream project. The local skill uses independent code and templates; no upstream code, prompt text, or interface assets are copied.

- Repository: https://github.com/LiPu-jpg/Openwrite
- Research records: `research/openwrite-integration-study-2026-08-09.md`,
  `research/openwrite-reader-review-integration-2026-08-09.md`

## Chapter-workflow research

The following public MIT repositories were inspected for architecture research. The skill uses independent code, templates, and tests; their code, prompt text, and source prose were not copied.

- https://github.com/HZ-KMNO/web-novel-writing-guidance-skill (reviewed at `24dd6d40099c97c3120dc37942e8dc99263c0259`)
- https://github.com/worldwonderer/oh-story-claudecode (reviewed at `70a834e88d1103f494f45667bab4b31472a83b58`)
- Research record: `research/agent-skill-practices-iteration-2026-08-09.md`

## Architecture research

The following public repositories informed independent architectural comparison:

- https://github.com/leenbj/novel-creator-skill
- https://github.com/MaoXiaoYuZ/Long-Novel-GPT
- https://github.com/EdwardAThomson/NovelWriter
- https://github.com/axiomhq/agent-memory

At research time, the first three did not expose a top-level license in the checked revisions. Their code, prompt text, and templates were therefore not copied. See `research/UPSTREAM.md` for pinned revisions and the exact boundary.
