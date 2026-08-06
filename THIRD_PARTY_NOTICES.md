# Third-party notices

This repository's skill implementation, templates, and tests are original work released under MIT.

## Firecrawl

The optional online ranking workflow calls a separately operated Firecrawl API. Firecrawl itself is not bundled. Its core repository is published under AGPL-3.0; its cloud service has separate pricing and terms.

- Core: https://github.com/firecrawl/firecrawl
- API documentation: https://docs.firecrawl.dev/api-reference/endpoint/scrape
- Self-hosting: https://github.com/firecrawl/firecrawl/blob/main/SELF_HOST.md

The research clone of `firecrawl/cli` was used only to inspect public interface and testing conventions. No code is copied into this repository.

## Architecture research

The following public repositories informed independent architectural comparison:

- https://github.com/leenbj/novel-creator-skill
- https://github.com/MaoXiaoYuZ/Long-Novel-GPT
- https://github.com/EdwardAThomson/NovelWriter
- https://github.com/axiomhq/agent-memory

At research time, the first three did not expose a top-level license in the checked revisions. Their code, prompt text, and templates were therefore not copied. See `research/UPSTREAM.md` for pinned revisions and the exact boundary.
