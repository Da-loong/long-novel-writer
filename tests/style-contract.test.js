'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const styleContract = require('../skill/long-novel-writer/scripts/style-contract');
const readerReview = require('../skill/long-novel-writer/scripts/chapter-reader-review');
const { build: contextBuild } = require('../skill/long-novel-writer/scripts/context-pack');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-style-contract-'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'style-contract'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const project = JSON.parse(result.stdout).project;
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0001-fixture.md'), '# Chapter 1\n\nLin kicks the door open.\n\nThe guard blocks the exit.\n', 'utf8');
  return project;
}

function signals(project) {
  fs.writeFileSync(path.join(project, styleContract.SOURCE), [
    '# Style signals', '',
    '| ID | Dimension | Reusable signal | Evidence | Scope | Status |',
    '|---|---|---|---|---|---|',
    '| STYLE-OPEN | narrative | Open inside a concrete action before any explanation. | evidence/sources/rank-scan.md#opening | opening | adopted |',
    '| STYLE-DIALOGUE | dialogue | Let resistance appear through a short exchange before exposition. | evidence/derivations/breakdown.md#dialogue | chapter:2 | adopted |',
    '| STYLE-NO | narrative | This must stay inactive. | evidence/sources/rank-scan.md#ignore | all | pending |',
    '| STYLE-BAD | unknown | Invalid dimension stays out. | evidence/sources/rank-scan.md#bad | all | adopted |',
  ].join('\n'), 'utf8');
}

function report(id, checks) {
  const evidence = 'Lin kicks the door open.';
  return {
    schema_version: '1.2', chapter: 1, reviewer_id: 'style-reader', verdict: 'pass',
    scores: { clarity: 8, continuation: 8, fanqie_fit: 8, character_agency: 8, payoff: 8 },
    scene_evidence: {
      goal: { status: 'present', evidence, note: 'The lead takes an immediate action.' },
      obstacle: { status: 'present', evidence: 'The guard blocks the exit.', note: 'The action meets opposition.' },
      turn: { status: 'present', evidence, note: 'The door changes the scene.' },
      payoff: { status: 'present', evidence: 'The guard blocks the exit.', note: 'The action creates a concrete consequence.' },
      hook: { status: 'present', evidence: 'The guard blocks the exit.', note: 'The blocked exit creates a next question.' },
    },
    style_signal_checks: checks === undefined ? [{ id, verdict: 'pass', evidence, note: 'The chapter begins in immediate action before explaining the situation.' }] : checks,
    rhythm: { pressure: 'rising', hook_type: 'risk', payoff_type: 'loss' }, issues: [], summary: 'A scene-first serial opening.',
  };
}

test('style contract keeps only adopted reusable signals and injects it into critical context', () => {
  const project = projectOf();
  signals(project);
  const compiled = styleContract.compile(project);
  assert.equal(compiled.signal_count, 2);
  assert.deepEqual(styleContract.due(project, 1).map((signal) => signal.id), ['STYLE-OPEN']);
  assert.deepEqual(styleContract.due(project, 2).map((signal) => signal.id), ['STYLE-OPEN', 'STYLE-DIALOGUE']);
  assert.equal(styleContract.due(project, 4).length, 0);
  assert.ok(compiled.warnings.some((warning) => warning.code === 'STYLE_SIGNAL_DIMENSION_INVALID'));
  const context = contextBuild(project, { chapter: '2', budget: '12000' });
  assert.ok(context.manifest.sources.some((item) => item.path === styleContract.OUTPUT && item.tier === 'critical'));
});

test('cold reader must verify every due adopted style signal and a failure blocks passing', () => {
  const project = projectOf();
  signals(project);
  styleContract.compile(project);
  const relative = 'analysis/chapter-reader-review-ch0001-r01.json';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report('STYLE-OPEN'), null, 2), 'utf8');
  const accepted = readerReview.validate(project, { chapter: '1', file: relative });
  assert.deepEqual(accepted.data.style_signal_failures, []);
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report('STYLE-OPEN', []), null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
  const failed = report('STYLE-OPEN', [{ id: 'STYLE-OPEN', verdict: 'fail', evidence: 'Lin kicks the door open.', note: 'The action appears but the narration still begins in summary.' }]);
  failed.verdict = 'revise';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(failed, null, 2), 'utf8');
  const revising = readerReview.validate(project, { chapter: '1', file: relative });
  assert.equal(revising.data.should_revise, true);
  assert.deepEqual(revising.data.style_signal_failures, ['STYLE-OPEN']);
  failed.verdict = 'pass';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(failed, null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
});
