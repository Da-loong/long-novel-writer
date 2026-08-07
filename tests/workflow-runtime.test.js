'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const runner = require('../skill/long-novel-writer/scripts/workflow-runner');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-workflow-'));
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts', 'init-project.js'),
    '--root', root, '--title', 'runtime-test', '--target-words', '1000000', '--genre', 'fantasy',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).project;
}

test('workflow start freezes manifest and checkpoint advances node', () => {
  const project = projectOf();
  const started = runner.start(project);
  assert.equal(started.current_node, 'build');
  const checkpoint = runner.checkpoint(project, 'build', { artifacts: 'settings/story-bible.md,settings/reader-contract.md' });
  assert.equal(checkpoint.next_node, 'character');
  const state = JSON.parse(fs.readFileSync(path.join(project, 'state', 'workflow-run.json'), 'utf8'));
  assert.deepEqual(state.completed_nodes, ['build']);
  assert.equal(state.manifest_sha256.length, 64);
  assert.equal(runner.status(project).manifest_frozen, true);
});

test('workflow failure and retry preserve completed checkpoints', () => {
  const project = projectOf();
  runner.start(project);
  runner.checkpoint(project, 'build', { artifacts: 'settings/story-bible.md' });
  runner.fail(project, 'character', { reason: 'fixture validation failure' });
  assert.equal(runner.status(project).status, 'blocked');
  const retried = runner.retry(project, 'character');
  assert.equal(retried.attempt, 2);
  assert.equal(runner.status(project).current_node, 'character');
  const state = JSON.parse(fs.readFileSync(path.join(project, 'state', 'workflow-run.json'), 'utf8'));
  assert.deepEqual(state.completed_nodes, ['build']);
  assert.equal(state.attempts.character, 2);
});

test('workflow post-hoc writes a continuity record with artifact hashes', () => {
  const project = projectOf();
  runner.start(project);
  const result = runner.postHoc(project, { chapter: '1', summary: 'A visible choice changes the next chapter.', artifacts: 'settings/story-bible.md' });
  assert.equal(result.chapter, 1);
  const ledger = fs.readFileSync(path.join(project, 'state', 'post-hoc-ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].artifacts[0].sha256.length, 64);
  assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'state', 'workflow-run.json'), 'utf8')).last_post_hoc.chapter, 1);
});
