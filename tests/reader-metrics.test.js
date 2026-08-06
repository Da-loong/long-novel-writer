'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeText } = require('../skill/long-novel-writer/scripts/reader-metrics');

test('reader metrics flags delayed opening action and explanation blocks', () => {
  const text = `# 第一章\n\n${'这是连续交代设定的段落，读者还不知道角色要做什么。'.repeat(35)}\n\n${'这是第二段连续解释，仍然没有动作，也没有人物选择。'.repeat(35)}\n\n门突然开了。`;
  const report = analyzeText('chapter.md', text);
  assert.ok(report.warnings.some((item) => item.code === 'OPENING_ACTION_DELAY'));
  assert.ok(report.warnings.some((item) => item.code === 'EXPOSITION_BLOCK'));
});

test('reader metrics counts straight-quoted Chinese dialogue and passes a compact scene', () => {
  const text = '# 第一章\n\n门响了。\n\n"走！"他拽住她冲下楼。\n\n楼道里的灯一盏接一盏熄灭。';
  const report = analyzeText('chapter.md', text);
  assert.equal(report.dialogue_chars, 1);
  assert.equal(report.reader_pass, true);
});
