'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { begin, finish, status } = require('../skill/long-novel-writer/scripts/chapter-transaction');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function preparedProject() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-transaction-'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', temp, '--title', '事务测试'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const project = JSON.parse(result.stdout).project;
  for (const name of ['settings/story-bible.md', 'settings/reader-contract.md']) {
    const file = path.join(project, name);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('待首次策划填写；未知项须显式标为“未知”，不得伪造。', '未知；待与作者确认。'), 'utf8');
  }
  fs.appendFileSync(path.join(project, 'outline', 'chapter-beats.md'), '| 1 | 林舟 | 找到账本 | 巡夜人 | 账本是诱饵 | 得线索失退路 | 知道内应存在 | 警觉转决绝 | 门外响起熟悉暗号 |\n', 'utf8');
  return project;
}

function writeChapterAndState(project, repeats = 30) {
  const starts = ['林舟', '保安', '雨声', '账本', '门缝', '远处', '水沟', '灯光'];
  const draft = Array.from({ length: repeats }, (_, index) => `${starts[index % starts.length]}抬手翻开账本，门外脚步停下，线索被他攥在掌心${index + 1}。`).join('\n\n');
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0001-first.md'), `# 第一章\n\n${draft}\n`, 'utf8');
  const stateFile = path.join(project, 'state', 'project-state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); state.updated_through = 1;
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(project, 'state', 'current-state.md'), '# 当前状态\n\nupdated_through: 1\n', 'utf8');
}

test('begin transaction builds context and locks the chapter before drafting', () => {
  const project = preparedProject();
  const report = begin(project, { chapter: '1', query: '林舟 账本', 'min-chars': '100', 'max-chars': '1200' });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.ok(fs.existsSync(path.join(project, 'state', 'context-pack.md')));
  const current = status(project);
  assert.equal(current.transaction.phase, 'drafting');
  assert.equal(current.has_active_transaction, true);
  assert.equal(current.next_action, 'finish --chapter 1');
});

test('an active chapter transaction blocks the next drafting transaction', () => {
  const project = preparedProject();
  begin(project, { chapter: '1', 'min-chars': '100' });
  assert.throws(() => begin(project, { chapter: '1' }), (error) => error.code === 'TRANSACTION_ACTIVE');
});

test('finish records failures and commits only after the hard length gate passes', () => {
  const project = preparedProject();
  begin(project, { chapter: '1', 'min-chars': '100', 'max-chars': '200' });
  writeChapterAndState(project, 30);
  let report = finish(project, { chapter: '1' });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'CHAPTER_TOO_LONG'));
  assert.equal(status(project).transaction.phase, 'drafting');
  writeChapterAndState(project, 8);
  report = finish(project, { chapter: '1' });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  const completed = status(project);
  assert.equal(completed.transaction.phase, 'completed');
  assert.equal(completed.has_active_transaction, false);
  assert.ok(fs.readFileSync(path.join(project, 'state', 'production-ledger.jsonl'), 'utf8').includes('chapter_committed'));
});

test('finish blocks silent canon mutation and records explicit approval', () => {
  const project = preparedProject();
  begin(project, { chapter: '1', 'min-chars': '100', 'max-chars': '1200' });
  fs.appendFileSync(path.join(project, 'settings', 'story-bible.md'), '\n## 新确认事实\n\n电网是封印。\n', 'utf8');
  writeChapterAndState(project, 20);
  let report = finish(project, { chapter: '1' });
  assert.ok(report.errors.some((item) => item.code === 'CANON_MUTATION_UNAPPROVED'));
  report = finish(project, { chapter: '1', 'approve-canon': true, reason: '本章揭示已经人工确认' });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(report.event.canon_approval.approved, true);
  assert.equal(report.event.canon_mutations[0].change, 'modified');
});
