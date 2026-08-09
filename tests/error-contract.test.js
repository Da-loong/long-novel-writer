'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

for (const script of ['cap-utils.js', 'check-ai-patterns.js', 'check-degeneration.js', 'format-gate.js', 'normalize-punctuation.js', 'init-project.js', 'validate-project.js', 'rank-scan.js', 'context-pack.js', 'foreshadowing-index.js', 'foreshadowing-reconcile.js', 'hook-agenda.js', 'resource-ledger.js', 'quality-trend-ledger.js', 'repair-debt-ledger.js', 'repair-lessons.js', 'plot-unit-window.js', 'feedback-rules.js', 'style-contract.js', 'character-contract.js', 'chapter-memory.js', 'chapter-card.js', 'chapter-gate.js', 'chapter-transaction.js', 'chapter-reader-review.js', 'chapter-facts.js', 'pacing-ledger.js', 'pilot-review.js', 'import-inventory.js', 'reader-metrics.js', 'handoff.js', 'autopilot.js', 'evidence-audit.js', 'classroom-audit.js', 'workflow-runner.js', 'autopilot-runner.js']) {
  test(`${script} emits a structured usage error`, () => {
    const result = spawnSync(process.execPath, [path.join(scripts, script)], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    const report = JSON.parse(result.stderr);
    assert.equal(report.ok, false);
    assert.ok(report.error.code);
    assert.doesNotMatch(result.stderr, /\n\s+at\s/);
  });
}
