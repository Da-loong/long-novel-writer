'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

for (const script of ['cap-utils.js', 'check-ai-patterns.js', 'check-degeneration.js', 'normalize-punctuation.js', 'init-project.js', 'validate-project.js', 'rank-scan.js', 'context-pack.js', 'chapter-gate.js', 'chapter-transaction.js', 'pilot-review.js', 'import-inventory.js', 'reader-metrics.js', 'handoff.js', 'autopilot.js', 'evidence-audit.js', 'classroom-audit.js']) {
  test(`${script} emits a structured usage error`, () => {
    const result = spawnSync(process.execPath, [path.join(scripts, script)], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    const report = JSON.parse(result.stderr);
    assert.equal(report.ok, false);
    assert.ok(report.error.code);
    assert.doesNotMatch(result.stderr, /\n\s+at\s/);
  });
}
