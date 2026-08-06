'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze: analyzeAi } = require('../skill/long-novel-writer/scripts/check-ai-patterns');
const { analyze: analyzeDegeneration } = require('../skill/long-novel-writer/scripts/check-degeneration');
const { countText } = require('../skill/long-novel-writer/scripts/cap-utils');

test('AI-pattern checker returns evidence line and excerpt', () => {
  const report = analyzeAi('chapter.md', '他不由得停下。\n与此同时，空气仿佛凝固。');
  assert.ok(report.findings.some((item) => item.rule === '心理代述' && item.line === 1));
  assert.ok(report.findings.some((item) => item.rule === '陈套意象' && item.excerpt));
});

test('AI-pattern checker ignores one necessary comparison but flags repeated isomorphic turns', () => {
  const single = analyzeAi('technical.md', '这不是交流电，而是残余感应电。');
  assert.ok(!single.findings.some((item) => item.rule === '同构转折'));
  const repeated = analyzeAi('patterned.md', '这不是恐惧，而是警觉。\n那不是退让，而是蓄力。');
  assert.equal(repeated.findings.filter((item) => item.rule === '同构转折').length, 2);
});

test('degeneration checker catches placeholders and duplicate paragraphs', () => {
  const paragraph = '这是一段用于检查重复的正文，角色沿着码头反复确认自己的选择和后果。';
  const report = analyzeDegeneration('chapter.md', `待补\n\n${paragraph}\n\n${paragraph}`);
  assert.ok(report.findings.some((item) => item.rule === '占位内容'));
  assert.ok(report.findings.some((item) => item.rule === '重复段落'));
});

test('text counting distinguishes Chinese and non-whitespace characters', () => {
  const counts = countText('# 标题\n\n“你好。”\nabc');
  assert.equal(counts.chinese_chars, 2);
  assert.equal(counts.dialogue_lines, 1);
  assert.ok(counts.non_whitespace_chars > counts.chinese_chars);
});
