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
  assert.ok(report.warnings.some((item) => item.code === 'PLACEHOLDER'));
  const manuscriptGuide = fs.readFileSync(path.join(project, 'manuscript', 'README.txt'), 'utf8');
  assert.match(manuscriptGuide, /ch-0001-/);
  assert.match(manuscriptGuide, /context-pack/);
  const second = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', temp, '--title', '测试长篇'], { encoding: 'utf8' });
  assert.equal(second.status, 2);
  assert.equal(JSON.parse(second.stderr).error.code, 'PROJECT_EXISTS');
});

test('initializer creates evidence and supervision control surfaces', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-evidence-'));
  const project = init(temp, '证据监管测试');
  for (const relative of [
    'evidence/README.md',
    'evidence/sources/source-index.md',
    'evidence/sources/writer-classroom-index.md',
    'evidence/lineage/manifest.json',
    'settings/platform-classroom-map.md',
    'settings/author-intent.md',
    'settings/context-policy.json',
    'state/current-focus.md',
    'state/foreshadowing-index.json',
    'state/pacing-ledger.json',
    'settings/workflow-policy.json',
    'settings/agent-runner.json',
    'state/workflow-run.json',
    'state/workflow-ledger.jsonl',
    'state/post-hoc-ledger.jsonl',
    'state/autopilot-run.json',
    'state/autopilot-run-ledger.jsonl',
    'supervision/dashboard.md',
    'supervision/review-queue.md',
    'supervision/stop-conditions.md',
  ]) assert.equal(fs.existsSync(path.join(project, relative)), true, relative);
  const audit = spawnSync(process.execPath, [path.join(scripts, 'project-audit.js'), project, '--write-manifest'], { encoding: 'utf8' });
  assert.equal(audit.status, 0, audit.stderr);
  assert.equal(JSON.parse(audit.stdout).missing_supervision_files.length, 0);
  assert.equal(fs.existsSync(path.join(project, 'evidence', 'lineage', 'manifest.json')), true);
});

test('validator rejects non-padded chapter filenames with an actionable example', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-project-name-'));
  const project = init(temp, '章名测试');
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-001-first.md'), '# 第一章\n', 'utf8');
  const report = validate(project);
  const finding = report.errors.find((item) => item.code === 'INVALID_CHAPTER_FILENAME');
  assert.ok(finding);
  assert.match(finding.detail, /ch-0001-opening\.md/);
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
