# DeterminFlow mechanism review

- Source: https://github.com/alikon-art/DeterminFlow
- Reviewed commit: `d89c2b70255c157246b5c57bef3c51818a0e8e8f`
- License: AGPL-3.0

## Accepted

- Per-node prompt/output effort metadata was added to the local Agent run transcript in commit `32d4736`. It supports audit of isolated drafting, review, repair, and fact-extraction work.
- Existing local workflow freeze, checkpoint, retry, and resume behavior already covers the useful state-machine pattern without importing a runtime.

## Rejected

- Desktop/web control plane, API service, database, plugin host, and upstream workflow code: product scope, deployment burden, and AGPL boundary conflict with an installable file-first Fanqie skill.
- Generic multi-agent novel workflow: local chapter transaction, literal-evidence review, reader contract, and Fanqie-specific formatting are stricter and remain authoritative.
