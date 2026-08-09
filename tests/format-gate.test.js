'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { analyze } = require('../skill/long-novel-writer/scripts/format-gate');

test('format gate accepts a mobile-first chapter with action and result beats', () => {
  const report = analyze('chapter.md', [
    '# 夜班门口',
    '',
    '雨水顺着铁门往下淌，林越抬手挡住保安。',
    '',
    '“把账本交出来。”保安伸手去抢。',
    '',
    '林越侧身让开，反手扣住他的手腕，账本掉进了水沟。',
    '',
    '水沟里亮起一行新字：明天中午，旧桥见。',
  ].join('\n'));
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(report.layout.excess_blank_lines, 0);
  assert.ok(report.flow.action_paragraphs >= 2);
});

test('format gate rejects publishing markup, crowded paragraphs and extra blank lines', () => {
  const report = analyze('chapter.md', `# 标题\n\n${'林越抬头看见门外的人，随后他又走了过去。'.repeat(30)}\n\n\n| 计划 | 结果 |\n|---|---|\n`);
  const codes = report.errors.map((item) => item.code);
  assert.ok(codes.includes('PARAGRAPH_TOO_LONG'));
  assert.ok(codes.includes('EXCESS_BLANK_LINES'));
  assert.ok(codes.includes('MARKDOWN_TABLE_IN_MANUSCRIPT'));
});

test('format gate flags sequence-chain流水账 instead of treating it as finished prose', () => {
  const paragraphs = Array.from({ length: 8 }, () => '然后他走到门口，接着他看见街上的灯，随后他回到屋里。');
  const report = analyze('chapter.md', `# 标题\n\n${paragraphs.join('\n\n')}`);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === '流水账_SEQUENCE_CHAIN'));
});

test('format gate rejects a generic future teaser at the chapter end', () => {
  const report = analyze('chapter.md', [
    '# 雨夜的欠条', '',
    '林越把欠条塞进旧秤，门口的人终于让开。', '',
    '可他不知道，真正的考验才刚刚开始。',
  ].join('\n'));
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'GENERIC_END_HOOK'));
  const concrete = analyze('chapter.md', '# 雨夜的欠条\n\n旧秤底下多了一张车票：明晚十二点，北站三号闸机。\n');
  assert.equal(concrete.ok, true, JSON.stringify(concrete.errors));
});
