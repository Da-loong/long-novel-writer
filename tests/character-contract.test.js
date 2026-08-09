'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const characterContract = require('../skill/long-novel-writer/scripts/character-contract');
const readerReview = require('../skill/long-novel-writer/scripts/chapter-reader-review');
const { build: contextBuild } = require('../skill/long-novel-writer/scripts/context-pack');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-character-contract-'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'character-contract'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const project = JSON.parse(result.stdout).project;
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0001-fixture.md'), '# Chapter 1\n\nLin kicks the door open.\n\nThe guard blocks the exit.\n', 'utf8');
  return project;
}

function contracts(project) {
  fs.writeFileSync(path.join(project, characterContract.SOURCE), [
    '# Character contracts', '',
    '| Name | Goal | Pressure/motivation | Knowledge boundary | Voice/action | Forbidden | Scope | Status |',
    '|---|---|---|---|---|---|---|---|',
    '| Lin | Recover the ledger before dawn. | The guard can expose him. | Knows only that the ledger is inside. | Uses short, practical actions before explanations. | Never claims to know the guard\'s employer. | opening | adopted |',
    '| Guard | Hold the exit until backup arrives. | Fears the missing ledger. | Knows the order, not why Lin wants the ledger. | Answers with brief procedural commands. | Never explains the employer\'s hidden plan. | chapter:2 | adopted |',
    '| Old | Inactive. | Inactive. | Inactive. | Inactive. | Inactive. | all | pending |',
  ].join('\n'), 'utf8');
}

function report(id, checks) {
  const evidence = 'Lin kicks the door open.';
  return {
    schema_version: '1.3', chapter: 1, reviewer_id: 'character-reader', verdict: 'pass',
    scores: { clarity: 8, continuation: 8, fanqie_fit: 8, character_agency: 8, payoff: 8 },
    scene_evidence: {
      goal: { status: 'present', evidence, note: 'The lead takes an immediate action.' },
      obstacle: { status: 'present', evidence: 'The guard blocks the exit.', note: 'The action meets opposition.' },
      turn: { status: 'present', evidence, note: 'The door changes the scene.' },
      payoff: { status: 'present', evidence: 'The guard blocks the exit.', note: 'The action creates a concrete consequence.' },
      hook: { status: 'present', evidence: 'The guard blocks the exit.', note: 'The blocked exit creates a next question.' },
    },
    character_contract_checks: checks === undefined ? [{ id, verdict: 'pass', evidence, note: 'Lin acts immediately toward the ledger rather than explaining the premise.' }] : checks,
    rhythm: { pressure: 'rising', hook_type: 'risk', payoff_type: 'loss' }, issues: [], summary: 'A scene-first serial opening.',
  };
}

test('character contracts compile active agency boundaries and enter critical context', () => {
  const project = projectOf();
  contracts(project);
  const compiled = characterContract.compile(project);
  assert.equal(compiled.character_count, 2);
  assert.deepEqual(characterContract.due(project, 1, 'Lin kicks the door open.').map((character) => character.name), ['Lin']);
  assert.deepEqual(characterContract.due(project, 2, 'Lin sees the Guard.').map((character) => character.name), ['Lin', 'Guard']);
  const context = contextBuild(project, { chapter: '2', budget: '12000' });
  assert.ok(context.manifest.sources.some((item) => item.path === characterContract.OUTPUT && item.tier === 'critical'));
});

test('cold reader must prove each due character contract and a failed character check blocks passing', () => {
  const project = projectOf();
  contracts(project);
  const compiled = characterContract.compile(project);
  const id = compiled.data.characters.find((character) => character.name === 'Lin').id;
  const relative = 'analysis/chapter-reader-review-ch0001-r01.json';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report(id), null, 2), 'utf8');
  const accepted = readerReview.validate(project, { chapter: '1', file: relative });
  assert.deepEqual(accepted.data.character_contract_failures, []);
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report(id, []), null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
  const failed = report(id, [{ id, verdict: 'fail', evidence: 'Lin kicks the door open.', note: 'The action omits the contract pressure and makes Lin appear all-knowing.' }]);
  failed.verdict = 'revise';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(failed, null, 2), 'utf8');
  const revising = readerReview.validate(project, { chapter: '1', file: relative });
  assert.equal(revising.data.should_revise, true);
  assert.deepEqual(revising.data.character_contract_failures, [id]);
  failed.verdict = 'pass';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(failed, null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
});
