'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chineseNumber, inventory } = require('../skill/long-novel-writer/scripts/import-inventory');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

test('Chinese chapter numbers are normalized', () => {
  assert.equal(chineseNumber('二十三'), 23);
  assert.equal(chineseNumber('一百零二'), 102);
  assert.equal(chineseNumber('37'), 37);
});

test('old-draft inventory preserves hashes and reports gaps', () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-import-source-'));
  fs.writeFileSync(path.join(source, 'draft.txt'), '第一章 起风\n正文甲。\n\n第三章 回港\n正文乙。\n', 'utf8');
  const report = inventory(source);
  assert.deepEqual(report.chapters.map((item) => item.number), [1, 3]);
  assert.deepEqual(report.diagnostics.gaps, [2]);
  assert.match(report.files[0].sha256, /^[a-f0-9]{64}$/);
});

test('inventory CLI writes machine inventory and editable source map', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-import-cli-'));
  const source = path.join(temp, 'source'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'draft.md'), '# 第1章 开门\n\n旧稿正文。\n', 'utf8');
  const init = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', temp, '--title', '导入项目'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const project = JSON.parse(init.stdout).project;
  const result = spawnSync(process.execPath, [path.join(scripts, 'import-inventory.js'), source, '--project', project], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(JSON.parse(fs.readFileSync(output.inventory, 'utf8')).chapters[0].number, 1);
  assert.match(fs.readFileSync(output.source_map, 'utf8'), /draft\.md:1/);
});
