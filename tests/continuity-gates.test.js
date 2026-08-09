'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build, termsOf } = require('../skill/long-novel-writer/scripts/context-pack');
const { capture } = require('../skill/long-novel-writer/scripts/chapter-memory');
const { gate } = require('../skill/long-novel-writer/scripts/chapter-gate');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function initializedProject() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-gate-'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', temp, '--title', '门禁测试'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).project;
}

test('context query keeps Chinese search terms deterministic', () => {
  assert.deepEqual(termsOf('林舟 灵石 debt'), ['林舟', '灵石', 'debt', '林舟', '灵石'].filter((value, index, list) => list.indexOf(value) === index));
});

test('pre gate requires current context, complete beat, and core settings', () => {
  const project = initializedProject();
  let report = gate(project, { stage: 'pre', chapter: '1' });
  const missingContext = report.errors.find((item) => item.code === 'CONTEXT_PACK_MISSING');
  assert.ok(missingContext);
  assert.match(missingContext.detail, /chapter 1 uses settings\/ and outline\//);
  assert.ok(report.errors.some((item) => item.code === 'CHAPTER_BEAT_MISSING'));
  for (const name of ['settings/story-bible.md', 'settings/reader-contract.md']) {
    const file = path.join(project, name);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('待首次策划填写；未知项须显式标为“未知”，不得伪造。', '未知；待与作者确认。'), 'utf8');
  }
  fs.appendFileSync(path.join(project, 'outline', 'chapter-beats.md'), '| 1 | 林舟 | 找到账本 | 巡夜人 | 账本是诱饵 | 得线索失退路 | 知道内应存在 | 警觉转决绝 | 门外响起熟悉暗号 |\n', 'utf8');
  const pack = build(project, { chapter: '1', query: '林舟 账本' });
  fs.writeFileSync(path.join(project, 'state', 'context-pack.md'), pack.markdown, 'utf8');
  report = gate(project, { stage: 'pre', chapter: '1' });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
});

test('pre gate rejects pipe characters that corrupt the nine-column beat schema', () => {
  const project = initializedProject();
  for (const name of ['settings/story-bible.md', 'settings/reader-contract.md']) {
    const file = path.join(project, name);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('待首次策划填写；未知项须显式标为“未知”，不得伪造。', '未知；待与作者确认。'), 'utf8');
  }
  fs.appendFileSync(path.join(project, 'outline', 'chapter-beats.md'), '| 1 | 林舟 | 找到账本 | 巡夜人 | 账本是诱饵 | 得线索 | 失退路 | 知道内应存在 | 警觉转决绝 | 门外响起暗号 |\n', 'utf8');
  const pack = build(project, { chapter: '1', query: '林舟 账本' });
  fs.writeFileSync(path.join(project, 'state', 'context-pack.md'), pack.markdown, 'utf8');
  const report = gate(project, { stage: 'pre', chapter: '1' });
  assert.ok(report.errors.some((item) => item.code === 'CHAPTER_BEAT_COLUMN_COUNT'));
});

test('context pack retrieves relevant cold chapters and marks tiers', () => {
  const project = initializedProject();
  const manuscript = path.join(project, 'manuscript');
  fs.writeFileSync(path.join(manuscript, 'ch-0001-old.md'), '# 第一章\n\n林舟把铜钥匙藏进墙缝。\n', 'utf8');
  fs.writeFileSync(path.join(manuscript, 'ch-0002-old.md'), '# 第二章\n\n众人在码头争论潮水。\n', 'utf8');
  fs.writeFileSync(path.join(manuscript, 'ch-0003-old.md'), '# 第三章\n\n铜钥匙的齿痕指向旧仓库。\n', 'utf8');
  fs.writeFileSync(path.join(manuscript, 'ch-0004-new.md'), '# 第四章\n\n风暴即将抵港。\n', 'utf8');
  const stateFile = path.join(project, 'state', 'project-state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); state.updated_through = 4;
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  fs.writeFileSync(path.join(project, 'state', 'current-state.md'), '# 当前状态\n\nupdated_through: 4\n', 'utf8');
  capture(project, { chapter: 3 });
  const pack = build(project, { chapter: '5', recent: '1', retrieve: '2', query: '铜钥匙' });
  const cold = pack.manifest.sources.filter((item) => item.tier === 'cold-retrieved');
  assert.deepEqual(cold.map((item) => item.path), ['manuscript/ch-0003-old.md', 'manuscript/ch-0001-old.md']);
  assert.equal(cold[0].representation, 'chapter-memory');
  assert.ok(cold[0].memory_path.endsWith('ch-0003.json'));
  assert.ok(pack.manifest.budget_report.included_chars > 0);
  assert.ok(pack.manifest.sources.some((item) => item.tier === 'hot-recent' && item.path.endsWith('ch-0004-new.md')));
});

test('post gate requires manuscript quality and committed state', () => {
  const project = initializedProject();
  const manuscript = path.join(project, 'manuscript');
  const starts = ['林舟', '保安', '雨声', '账本', '门缝', '远处', '水沟', '灯光'];
  const draft = Array.from({ length: 30 }, (_, index) => `${starts[index % starts.length]}抬手翻开账本，门外脚步停下，线索被他攥在掌心${index + 1}。`).join('\n\n');
  fs.writeFileSync(path.join(manuscript, 'ch-0001-first.md'), `# 第一章\n\n${draft}\n`, 'utf8');
  let report = gate(project, { stage: 'post', chapter: '1', 'min-chars': '100' });
  assert.ok(report.errors.some((item) => item.code === 'STATE_NOT_COMMITTED'));
  const stateFile = path.join(project, 'state', 'project-state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); state.updated_through = 1;
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  fs.writeFileSync(path.join(project, 'state', 'current-state.md'), '# 当前状态\n\nupdated_through: 1\n', 'utf8');
  report = gate(project, { stage: 'post', chapter: '1', 'min-chars': '100' });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
});

test('post gate enforces an optional maximum chapter length', () => {
  const project = initializedProject();
  const manuscript = path.join(project, 'manuscript');
  fs.writeFileSync(path.join(manuscript, 'ch-0001-first.md'), `# 第一章\n\n${'夜色压住码头，林舟握紧账本向前走。'.repeat(30)}\n`, 'utf8');
  const stateFile = path.join(project, 'state', 'project-state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); state.updated_through = 1;
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  fs.writeFileSync(path.join(project, 'state', 'current-state.md'), '# 当前状态\n\nupdated_through: 1\n', 'utf8');
  const report = gate(project, { stage: 'post', chapter: '1', 'min-chars': '100', 'max-chars': '200' });
  assert.ok(report.errors.some((item) => item.code === 'CHAPTER_TOO_LONG'));
});

test('context pack keeps recent prose ahead of oversized warm canon', () => {
  const project = initializedProject();
  const manuscript = path.join(project, 'manuscript');
  fs.writeFileSync(path.join(manuscript, 'ch-0001-recent.md'), '# Recent\n\n' + 'Immediate action changes the choice. '.repeat(120), 'utf8');
  const stateFile = path.join(project, 'state', 'project-state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); state.updated_through = 1;
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  fs.writeFileSync(path.join(project, 'settings', 'story-bible.md'), '# Warm canon\n\n' + 'Background. '.repeat(3000), 'utf8');
  const pack = build(project, { chapter: '2', recent: '1', budget: '9000' });
  assert.ok(pack.manifest.sources.some((item) => item.tier === 'hot-recent' && item.path.endsWith('ch-0001-recent.md')));
  assert.ok(pack.manifest.budget_report.tier_chars['hot-recent'] > 0);
  assert.ok(pack.manifest.budget_report.included_chars <= 9000);
});
