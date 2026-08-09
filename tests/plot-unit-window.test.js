'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const window = require('../skill/long-novel-writer/scripts/plot-unit-window');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-plot-unit-'));
  const init = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'plot-unit'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  return JSON.parse(init.stdout).project;
}

function writePlan(project, rows) {
  fs.writeFileSync(path.join(project, 'outline', 'plot-units.md'), [
    '# Plot units', '', '| ID | Start | End | Primary drive | Setup | Turn | Payoff | Next |',
    '|---|---:|---:|---|---|---|---|---|', ...rows,
  ].join('\n'), 'utf8');
}

test('plot-unit window selects a phase and binds its source hash', () => {
  const project = projectOf();
  writePlan(project, [
    '| U-01 | 1 | 3 | expose debt trap | receipt blocks exit | witness turns | Lin loses public cover | creditor mystery |',
    '| U-02 | 4 | 6 | chase creditor | new location | alliance breaks | debt clue paid | rival promise |',
  ]);
  const turn = window.write(project, { chapter: '2' });
  assert.equal(turn.data.enabled, true);
  assert.equal(turn.data.unit.id, 'U-01');
  assert.equal(turn.data.unit.phase, 'turn');
  assert.equal(turn.data.unit.required_delivery, 'witness turns');
  assert.match(turn.data.source_sha256, /^[a-f0-9]{64}$/);
  const payoff = window.write(project, { chapter: '3' });
  assert.equal(payoff.data.unit.phase, 'payoff');
  assert.equal(payoff.data.unit.required_delivery, 'Lin loses public cover');
  const outside = window.build(project, { chapter: '8' });
  assert.equal(outside.data.enabled, false);
  assert.ok(outside.data.warnings.some((item) => item.code === 'PLOT_UNIT_CHAPTER_UNASSIGNED'));
});

test('plot-unit window fails closed for overlapping or incomplete plans', () => {
  const project = projectOf();
  writePlan(project, [
    '| U-01 | 1 | 3 | a | b | c | d | e |',
    '| U-02 | 3 | 5 | a | b | c | d | e |',
  ]);
  assert.throws(() => window.build(project, { chapter: '1' }), (error) => error.code === 'PLOT_UNIT_PLAN_INVALID' && error.details.errors.some((item) => item.code === 'PLOT_UNIT_RANGE_OVERLAP'));
  writePlan(project, ['| U-01 | 1 | 3 | a | b |  | d | e |']);
  assert.throws(() => window.build(project, { chapter: '1' }), (error) => error.code === 'PLOT_UNIT_PLAN_INVALID' && error.details.errors.some((item) => item.field === 'turn'));
});

test('plot-unit window accepts the editable Chinese table headers', () => {
  const project = projectOf();
  fs.writeFileSync(path.join(project, 'outline', 'plot-units.md'), [
    '# ????', '', '| ??ID | ?? | ?? | ??? | ?? | ?? | ?? | ???? |',
    '|---|---:|---:|---|---|---|---|---|',
    '| ??-01 | 1 | 2 | ?? | ???? | ???? | ???? | ????? |',
  ].join('\n'), 'utf8');
  const result = window.build(project, { chapter: '1' });
  assert.equal(result.data.unit.id, '??-01');
  assert.equal(result.data.unit.primary_drive, '??');
});
