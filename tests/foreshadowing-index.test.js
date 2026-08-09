'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const index = require('../skill/long-novel-writer/scripts/foreshadowing-index');

function projectOf() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-foreshadow-'));
  fs.mkdirSync(path.join(project, 'outline'), { recursive: true });
  return project;
}

test('foreshadowing index derives due work and validates dependencies', () => {
  assert.equal(index.argsOf(['book', '--write']).write, true);
  const project = projectOf();
  fs.writeFileSync(path.join(project, index.LEDGER), [
    '# Foreshadowing', '',
    '| ID | Setup | Content | Reinforcement | Payoff | Status |',
    '|---|---:|---|---:|---:|---|',
    '| F-01 | 2 | receipt | 3, 4 | 5 | open |',
    '| F-02 | 1 | code depends: F-01 | 2 | 4 | open |',
  ].join('\n'), 'utf8');
  const result = index.write(project, { chapter: '4' });
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.due.map((item) => `${item.id}:${item.kind}`).sort(), ['F-01:reinforcement', 'F-02:payoff_due']);
  assert.deepEqual(result.edges, [{ from: 'F-02', to: 'F-01' }]);
  assert.ok(fs.existsSync(path.join(project, index.OUTPUT)));
});

test('foreshadowing index catches duplicate identifiers and dependency cycles', () => {
  const project = projectOf();
  fs.writeFileSync(path.join(project, index.LEDGER), [
    '| ID | Setup | Content | Reinforcement | Payoff | Status |',
    '|---|---:|---|---:|---:|---|',
    '| F-01 | 1 | key depends: F-02 | 2 | 3 | open |',
    '| F-02 | 2 | lock depends: F-01 | 3 | 4 | open |',
    '| F-01 | 3 | duplicate | 4 | 5 | open |',
  ].join('\n'), 'utf8');
  const result = index.build(project, { chapter: '3' });
  const codes = result.errors.map((item) => item.code);
  assert.ok(codes.includes('FORESHADOW_DUPLICATE_ID'));
  assert.ok(codes.includes('FORESHADOW_DEPENDENCY_CYCLE'));
});
