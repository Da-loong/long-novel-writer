'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lessons = require('../skill/long-novel-writer/scripts/repair-lessons');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');
function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-repair-lessons-'));
  const init = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'repair-lessons'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  return JSON.parse(init.stdout).project;
}
function writeLedger(project, entries) {
  fs.writeFileSync(path.join(project, 'state', 'repair-debt-ledger.json'), JSON.stringify({ schema_version: '1.0', entries }, null, 2), 'utf8');
}

test('repair lessons promote only recurring cross-chapter debt with source proof', () => {
  const project = projectOf();
  writeLedger(project, [
    { chapter: 1, initial_debt_keys: ['scene:payoff', 'issue:one-off'], repeated_debt_keys: [] },
    { chapter: 2, initial_debt_keys: ['scene:payoff', 'editorial:causal_chain'], repeated_debt_keys: [] },
    { chapter: 3, initial_debt_keys: ['editorial:causal_chain'], repeated_debt_keys: [] },
  ]);
  const result = lessons.write(project, { chapter: '4' });
  assert.equal(result.data.lessons.length, 2);
  assert.deepEqual(result.data.lessons.map((item) => [item.id, item.recurrence, item.chapters]), [
    ['repair:editorial:causal_chain', 2, [2, 3]], ['repair:scene:payoff', 2, [1, 2]],
  ]);
  assert.match(result.data.source_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.data.lessons.some((item) => item.key === 'issue:one-off'), false);
});

test('repair lessons warn without fabricating lessons when debt history is absent', () => {
  const project = projectOf();
  fs.unlinkSync(path.join(project, 'state', 'repair-debt-ledger.json'));
  const result = lessons.build(project, { chapter: '1' });
  assert.deepEqual(result.data.lessons, []);
  assert.ok(result.data.warnings.some((item) => item.code === 'REPAIR_DEBT_LEDGER_MISSING'));
});
