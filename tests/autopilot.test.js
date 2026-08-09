'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { start, pilotPass, status } = require('../skill/long-novel-writer/scripts/autopilot');
const { requirePilotApproval } = require('../skill/long-novel-writer/scripts/chapter-transaction');

function initProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-autopilot-'));
  const script = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts', 'init-project.js');
  const result = spawnSync(process.execPath, [script, '--root', root, '--title', '自动编排测试', '--target-words', '1000000'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).project;
}

test('autopilot start records a resumable mode without removing supervised files', () => {
  const project = initProject();
  const report = start(project);
  assert.equal(report.mode, 'autopilot');
  assert.equal(report.phase, 'discover');
  assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'state', 'autopilot.json'), 'utf8')).mode, 'autopilot');
  assert.ok(fs.existsSync(path.join(project, 'state', 'pilot-verdict.json')));
});

test('autopilot pilot pass requires independent evidence and unlocks chapter four', () => {
  const project = initProject();
  start(project);
  for (let chapter = 1; chapter <= 3; chapter++) fs.writeFileSync(path.join(project, 'manuscript', `ch-${String(chapter).padStart(4, '0')}-test.md`), `# 第${chapter}章\n\n门突然开了。\n`, 'utf8');
  const evidencePath = path.join(project, 'analysis', 'autopilot-pilot.json');
  fs.writeFileSync(evidencePath, JSON.stringify({ reviewed_through: 3, independent_readers: 3, distinct_models: 2, reader_score: 8.2, platform_fit: 8.1, comprehension_pass_rate: 0.9, continuation_rate: 0.75, critical_failures: 0, target_anchors: [{ id: 'C1', target: '首章出现危机', status: 'fulfilled', evidence: [{ path: 'manuscript/ch-0001-test.md', quote: '门突然开了。' }] }, { id: 'C2', target: '三章有选择', status: 'fulfilled', evidence: [{ path: 'manuscript/ch-0002-test.md', quote: '门突然开了。' }] }, { id: 'C3', target: '三章有钩子', status: 'fulfilled', evidence: [{ path: 'manuscript/ch-0003-test.md', quote: '门突然开了。' }] }], reader_reports: [{ id: 'r1', model_id: 'model-a', summary: '看懂', confusions: [], continue_next: true }, { id: 'r2', model_id: 'model-b', summary: '看懂', confusions: [], continue_next: true }, { id: 'r3', model_id: 'model-a', summary: '看懂', confusions: [], continue_next: true }] }), 'utf8');
  const report = pilotPass(project, { evidence: evidencePath });
  assert.equal(report.verdict.status, 'approved');
  const state = JSON.parse(fs.readFileSync(path.join(project, 'state', 'project-state.json'), 'utf8'));
  state.updated_through = 3;
  assert.doesNotThrow(() => requirePilotApproval(project, state, 4));
  assert.equal(status(project).release_to_scale, true);
});

test('autopilot pilot pass keeps the gate closed below thresholds', () => {
  const project = initProject();
  start(project);
  const evidencePath = path.join(project, 'analysis', 'weak-pilot.json');
  fs.writeFileSync(evidencePath, JSON.stringify({ reviewed_through: 3, independent_readers: 3, reader_score: 7.9, platform_fit: 8, comprehension_pass_rate: 0.9, continuation_rate: 0.75, critical_failures: 0, target_anchors: [{ id: 'C1', target: '首章出现危机', status: 'fulfilled', evidence: [{ path: 'state/current-state.md', quote: '# 当前状态' }] }], reader_reports: [{ id: 'r1', summary: '看懂', confusions: [], continue_next: true }, { id: 'r2', summary: '看懂', confusions: [], continue_next: true }, { id: 'r3', summary: '看懂', confusions: [], continue_next: true }] }), 'utf8');
  assert.throws(() => pilotPass(project, { evidence: evidencePath }), (error) => error.code === 'AUTOPILOT_PILOT_FAILED');
});

test('autopilot pilot pass rejects three reviews from a single model', () => {
  const project = initProject();
  start(project);
  for (let chapter = 1; chapter <= 3; chapter++) fs.writeFileSync(path.join(project, 'manuscript', `ch-${String(chapter).padStart(4, '0')}-test.md`), `# 第${chapter}章\n\n门突然开了。\n`, 'utf8');
  const evidencePath = path.join(project, 'analysis', 'single-model-pilot.json');
  fs.writeFileSync(evidencePath, JSON.stringify({
    reviewed_through: 3, independent_readers: 3, distinct_models: 1, reader_score: 8.5, platform_fit: 8.5, comprehension_pass_rate: 1, continuation_rate: 1, critical_failures: 0,
    target_anchors: [{ id: 'C1', target: '首章出现危机', status: 'fulfilled', evidence: [{ path: 'manuscript/ch-0001-test.md', quote: '门突然开了。' }] }],
    reader_reports: [1, 2, 3].map((id) => ({ id: `r${id}`, model_id: 'same-model', summary: '看懂', confusions: [], continue_next: true })),
  }), 'utf8');
  assert.throws(() => pilotPass(project, { evidence: evidencePath }), (error) => error.code === 'AUTOPILOT_PILOT_FAILED' && error.details.failures.includes('cross_model'));
});
