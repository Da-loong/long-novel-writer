'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build } = require('../skill/long-novel-writer/scripts/handoff');

test('handoff captures the next action, latest chapter and pilot gate', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-handoff-'));
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts', 'init-project.js'), '--root', temp, '--title', '交接测试', '--target-words', '600000'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const project = JSON.parse(result.stdout).project;
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0001-opening.md'), '# 第一章\n\n门突然开了。\n', 'utf8');
  const statePath = path.join(project, 'state', 'project-state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8')); state.updated_through = 3;
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  const handoff = build(project);
  assert.equal(handoff.next_chapter, 4);
  assert.equal(handoff.latest_chapter, 'ch-0001-opening.md');
  assert.equal(handoff.release_to_scale, false);
  assert.match(handoff.markdown, /先完成黄金三章真人冷读/);
});
