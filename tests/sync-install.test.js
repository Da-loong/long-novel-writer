'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tool = path.join(__dirname, '..', 'tools', 'sync-install.mjs');

test('installer performs verified replacement and retains rollback backup', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-install-'));
  const target = path.join(temp, 'long-novel-writer');
  fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'old.txt'), 'old', 'utf8');
  const result = spawnSync(process.execPath, [tool, '--target', target], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout).results[0];
  assert.equal(report.source.sha256, report.installed.sha256);
  assert.ok(fs.existsSync(path.join(target, 'SKILL.md')));
  assert.ok(report.backup && fs.existsSync(path.join(report.backup, 'old.txt')));
});

test('installer dry run does not change target', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-install-dry-'));
  const target = path.join(temp, 'long-novel-writer');
  fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'sentinel.txt'), 'keep', 'utf8');
  const result = spawnSync(process.execPath, [tool, '--target', target, '--dry-run'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(target, 'sentinel.txt'), 'utf8'), 'keep');
  assert.equal(JSON.parse(result.stdout).results[0].dryRun, true);
});

test('in-place mirror removes stale files and preserves the root directory', async () => {
  const { mirrorInPlace, treeHash } = await import('../tools/sync-install.mjs');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-mirror-'));
  const from = path.join(temp, 'source'); const target = path.join(temp, 'long-novel-writer');
  fs.mkdirSync(from); fs.mkdirSync(target);
  fs.writeFileSync(path.join(from, 'new.txt'), 'new', 'utf8');
  fs.writeFileSync(path.join(target, 'stale.txt'), 'stale', 'utf8');
  mirrorInPlace(from, target);
  assert.equal(fs.existsSync(target), true);
  assert.equal(fs.existsSync(path.join(target, 'stale.txt')), false);
  assert.equal(treeHash(from).sha256, treeHash(target).sha256);
});
