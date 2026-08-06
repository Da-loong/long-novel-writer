'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts', 'normalize-punctuation.js');

test('write mode preserves a backup and replaces atomically', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-normalize-'));
  const file = path.join(temp, 'chapter.md');
  fs.writeFileSync(file, '他说...然后走了!\n', 'utf8');
  const result = spawnSync(process.execPath, [script, file, '--write'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.changed, 1);
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), '他说...然后走了!\n');
  assert.equal(fs.readFileSync(file, 'utf8'), '他说……然后走了！\n');
  assert.deepEqual(fs.readdirSync(temp).filter((name) => name.endsWith('.tmp')), []);
});

test('out-dir mode leaves the source untouched', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-normalize-out-'));
  const source = path.join(temp, 'source'); const output = path.join(temp, 'output');
  fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'chapter.md'), '看这里?\n', 'utf8');
  const result = spawnSync(process.execPath, [script, source, '--write', '--out-dir', output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(source, 'chapter.md'), 'utf8'), '看这里?\n');
  assert.equal(fs.readFileSync(path.join(output, 'chapter.md'), 'utf8'), '看这里？\n');
});
