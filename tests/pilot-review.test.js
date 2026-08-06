'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { decide, status } = require('../skill/long-novel-writer/scripts/pilot-review');
const { requirePilotApproval } = require('../skill/long-novel-writer/scripts/chapter-transaction');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectAt(chapter = 3) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-pilot-'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', '试读门测试', '--target-words', '1000000'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const project = JSON.parse(result.stdout).project;
  const stateFile = path.join(project, 'state', 'project-state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  state.updated_through = chapter;
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return { project, state };
}

test('million-word production is blocked after chapter three without a human pilot verdict', () => {
  const { project, state } = projectAt(3);
  assert.throws(() => requirePilotApproval(project, state, 4), (error) => error.code === 'PILOT_NOT_APPROVED');
  assert.equal(status(project).release_to_scale, false);
});

test('pilot approval requires explicit human confirmation and unlocks scale production', () => {
  const { project, state } = projectAt(3);
  assert.throws(() => decide(project, 'approve', { reviewer: '读者甲', reason: '三章读完愿意追读', 'reviewed-through': '3' }), (error) => error.code === 'HUMAN_CONFIRMATION_REQUIRED');
  decide(project, 'approve', { reviewer: '读者甲', reason: '三章读完愿意追读', 'reviewed-through': '3', 'human-confirmed': true });
  assert.doesNotThrow(() => requirePilotApproval(project, state, 4));
  assert.equal(status(project).release_to_scale, true);
});

test('a later human rejection closes the scale gate again', () => {
  const { project, state } = projectAt(4);
  decide(project, 'approve', { reviewer: '读者甲', reason: '先行通过', 'reviewed-through': '3', 'human-confirmed': true });
  decide(project, 'reject', { reviewer: '读者甲', reason: '第四章暴露可读性问题', 'reviewed-through': '4' });
  assert.throws(() => requirePilotApproval(project, state, 5), (error) => error.code === 'PILOT_NOT_APPROVED');
  assert.equal(status(project).verdict.status, 'rejected');
});
