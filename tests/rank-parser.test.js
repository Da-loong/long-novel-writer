'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseRankInput } = require('../skill/long-novel-writer/scripts/cap-utils');

const fixture = (name) => path.join(__dirname, 'fixtures', name);

for (const [name, expected] of [
  ['ranking.json', ['山海夜航', '长街有雪']],
  ['ranking.jsonl', ['第一本', '第二本']],
  ['ranking.html', ['雾港来信', '星河旧梦']],
  ['ranking.pipe', ['春灯录', '第七码头']],
]) {
  test(`parse ranking fixture: ${name}`, () => {
    const rows = parseRankInput(fixture(name), 'test');
    assert.deepEqual(rows.map((row) => row.title), expected);
    assert.deepEqual(rows.map((row) => row.rank), [1, 2]);
    assert.ok(rows.every((row) => row.captured_at && row.source === 'test'));
  });
}

test('HTML cells remain separate fields', () => {
  const [row] = parseRankInput(fixture('ranking.html'), 'test');
  assert.equal(row.author, '林舟');
  assert.equal(row.genre, '悬疑');
  assert.equal(row.words, 230000);
});
