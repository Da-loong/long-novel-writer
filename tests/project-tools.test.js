'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validate } = require('../skill/long-novel-writer/scripts/validate-project');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function init(temp, title = '测试长篇') {
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', temp, '--title', title, '--genre', '悬疑', '--target-words', '600000'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).project;
}

test('initializer creates a complete, valid project without overwriting', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-project-'));
  const project = init(temp);
  const report = validate(project);
  assert.equal(report.ok, true);
  assert.equal(report.latest_chapter, 0);
  const second = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', temp, '--title', '测试长篇'], { encoding: 'utf8' });
  assert.equal(second.status, 2);
  assert.equal(JSON.parse(second.stderr).error.code, 'PROJECT_EXISTS');
});

test('validator catches chapter gaps and stale state', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-project-bad-'));
  const project = init(temp, '断章测试');
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0002-gap.md'), '# 第二章\n', 'utf8');
  const report = validate(project);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'CHAPTER_GAP'));
  assert.ok(report.errors.some((item) => item.code === 'STATE_CHAPTER_MISMATCH'));
});

test('validator catches duplicate hook IDs', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-project-hooks-'));
  const project = init(temp, '钩子测试');
  fs.appendFileSync(path.join(project, 'state', 'unresolved-hooks.md'), '\nHOOK-X\nHOOK-X\n', 'utf8');
  const report = validate(project);
  assert.ok(report.errors.some((item) => item.code === 'DUPLICATE_HOOK_ID'));
});
