'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const feedbackRules = require('../skill/long-novel-writer/scripts/feedback-rules');
const readerReview = require('../skill/long-novel-writer/scripts/chapter-reader-review');
const { build: contextBuild } = require('../skill/long-novel-writer/scripts/context-pack');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-feedback-rules-'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'feedback-rules'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const project = JSON.parse(result.stdout).project;
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0001-fixture.md'), '# Chapter 1\n\nLin kicks the door open.\n\nThe guard blocks the exit.\n', 'utf8');
  return project;
}

function ledger(project) {
  fs.writeFileSync(path.join(project, feedbackRules.SOURCE), [
    '# Feedback ledger', '',
    '| Date | Feedback | Layer | Rule action | Verify | Status |',
    '|---|---|---|---|---:|---|',
    '| 2026-08-09 | Reads like an essay instead of a serial. | expression | Open with concrete action; replace summary with immediate consequence. | 1 | active |',
    '| 2026-08-09 | Old preference. | expression | Ignore this stale rule. | 1 | resolved |',
  ].join('\n'), 'utf8');
}

function report(ruleId, checks) {
  const evidence = 'Lin kicks the door open.';
  return {
    schema_version: '1.1', chapter: 1, reviewer_id: 'feedback-reader', verdict: 'pass',
    scores: { clarity: 8, continuation: 8, fanqie_fit: 8, character_agency: 8, payoff: 8 },
    scene_evidence: {
      goal: { status: 'present', evidence, note: 'The lead takes an immediate action.' },
      obstacle: { status: 'present', evidence: 'The guard blocks the exit.', note: 'The action meets opposition.' },
      turn: { status: 'present', evidence, note: 'The door changes the scene.' },
      payoff: { status: 'present', evidence: 'The guard blocks the exit.', note: 'The action creates a concrete consequence.' },
      hook: { status: 'present', evidence: 'The guard blocks the exit.', note: 'The blocked exit creates a next question.' },
    },
    feedback_rule_checks: checks === undefined ? [{ id: ruleId, verdict: 'pass', evidence, note: 'The opening begins in action and the resistance is immediate.' }] : checks,
    rhythm: { pressure: 'rising', hook_type: 'risk', payoff_type: 'loss' }, issues: [], summary: 'A scene-first serial opening.',
  };
}

test('feedback ledger compiles only active actionable rules and injects them as critical context', () => {
  const project = projectOf();
  ledger(project);
  const compiled = feedbackRules.compile(project);
  assert.equal(compiled.rule_count, 1);
  assert.equal(compiled.data.rules[0].verification_chapter, 1);
  assert.equal(feedbackRules.due(project, 1)[0].rule, 'Open with concrete action; replace summary with immediate consequence.');
  const context = contextBuild(project, { chapter: '2', budget: '12000' });
  assert.ok(context.manifest.sources.some((item) => item.path === feedbackRules.OUTPUT && item.tier === 'critical'));
});

test('cold reader must check each due feedback rule and a failure prevents a pass', () => {
  const project = projectOf();
  ledger(project);
  const compiled = feedbackRules.compile(project);
  const id = compiled.data.rules[0].id;
  const relative = 'analysis/chapter-reader-review-ch0001-r01.json';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report(id), null, 2), 'utf8');
  const accepted = readerReview.validate(project, { chapter: '1', file: relative });
  assert.equal(accepted.data.feedback_rule_checks[0].id, id);
  assert.deepEqual(accepted.data.feedback_rule_failures, []);
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report(id, []), null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
  const failed = report(id, [{ id, verdict: 'fail', evidence: 'Lin kicks the door open.', note: 'The prose still summarizes after the action.' }]);
  failed.verdict = 'revise';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(failed, null, 2), 'utf8');
  const revising = readerReview.validate(project, { chapter: '1', file: relative });
  assert.equal(revising.data.should_revise, true);
  assert.deepEqual(revising.data.feedback_rule_failures, [id]);
  failed.verdict = 'pass';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(failed, null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
});
