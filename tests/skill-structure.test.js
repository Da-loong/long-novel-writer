'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('skill structure gate passes', () => {
  const root = path.join(__dirname, '..');
  const result = spawnSync(process.execPath, [path.join(root, 'tools', 'check-skill.mjs')], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.ok(report.files >= 100);
  assert.equal(report.genreCards, 32);
});
