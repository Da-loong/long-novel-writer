# AI-Novel-Writing-Assistant mechanism review: resource continuity

- Upstream examined: [ExplosiveCoderflome/AI-Novel-Writing-Assistant](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant)
- Revision examined: `91ef5b4a2032b96f579f0bc22ff50a560c6e1f6c` (`2026-08-09` local source review)
- Boundary: this skill uses an independent file-based implementation; no upstream code, prompt text, UI, or assets are copied.

## Mechanism retained

The high-value pattern is an evidence-first resource ledger:

- distinguish accepted hard resource facts from proposals or inferred state;
- pass a chapter-specific window instead of an unlimited inventory dump;
- retain holder, availability, consumption, concealment, loss, damage, and
  access as continuity constraints; and
- surface stale and use-window risk rather than silently inventing a resolution.

This maps directly to Chinese web fiction, where money, tokens, props,
credentials, cultivation resources, skills, and relationship favors often drive
chapter choices and are a frequent source of reader-visible continuity errors.

## Local implementation

`chapter-facts.js` schema 1.1 accepts a typed resource delta only with literal
accepted prose evidence. `resource-ledger.js` derives the ledger and compact
resource window. The chapter transaction freezes both; the context pack, chapter
card, draft prompt, cold reader, revision prompt, post-commit artifact audit,
and rollback snapshot share them.

## Excluded product layers

The desktop editor, database, RAG/embedding service, screen-level asset
management, and UI Agent runtime remain outside this portable skill.
