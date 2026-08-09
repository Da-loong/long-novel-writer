'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const readerReview = require('../skill/long-novel-writer/scripts/chapter-reader-review');
const { audit } = require('../skill/long-novel-writer/scripts/project-audit');

function fixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-reader-review-'));
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts', 'init-project.js'),
    '--root', root, '--title', 'reader-review-test', '--target-words', '1000000', '--genre', '都市',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const project = JSON.parse(result.stdout).project;
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0001-雨夜.md'), '# 雨夜\n\n林越把欠条按在柜台上，雨水顺着他的手背滴落。\n\n巷口的人没有散，反而把退路堵住了。\n', 'utf8');
  return project;
}

function report(overrides = {}) {
  return {
    schema_version: '1.0', chapter: 1, reviewer_id: 'reader-fixture', verdict: 'pass',
    scores: { clarity: 8, continuation: 8, fanqie_fit: 8, character_agency: 8, payoff: 8 },
    scene_evidence: {
      goal: { status: 'present', evidence: '林越把欠条按在柜台上，雨水顺着他的手背滴落。', note: 'The objective is visible in action.' },
      obstacle: { status: 'present', evidence: '巷口的人没有散，反而把退路堵住了。', note: 'The opposition closes the exit.' },
      turn: { status: 'present', evidence: '林越把欠条按在柜台上，雨水顺着他的手背滴落。', note: 'The public commitment changes the situation.' },
      payoff: { status: 'present', evidence: '巷口的人没有散，反而把退路堵住了。', note: 'The public commitment produces a concrete, worsened position.' },
      hook: { status: 'present', evidence: '巷口的人没有散，反而把退路堵住了。', note: 'The blocked exit leaves an immediate question.' },
    },
    rhythm: { pressure: 'rising', hook_type: 'risk', payoff_type: 'loss' },
    issues: [], summary: 'Clear scene pressure.', ...overrides,
  };
}

test('chapter reader review accepts scorecard and literal manuscript evidence', () => {
  const project = fixtureProject();
  const relative = 'analysis/chapter-reader-review-ch0001-r01.json';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    verdict: 'revise', scores: { clarity: 6, continuation: 8, fanqie_fit: 8, character_agency: 8, payoff: 8 },
    issues: [{ code: 'OPENING_PULL', severity: 'warning', evidence: '林越把欠条按在柜台上，雨水顺着他的手背滴落。', repair: 'Make the immediate opposition answer the action.' }],
  }), null, 2), 'utf8');
  const result = readerReview.validate(project, { chapter: '1', file: relative, 'min-score': '7' });
  assert.equal(result.ok, true);
  assert.equal(result.data.should_revise, true);
  assert.deepEqual(result.data.low_scores, ['clarity']);
  assert.equal(result.data.review_of, 'manuscript/ch-0001-雨夜.md');
  assert.match(result.data.manuscript_sha256, /^[a-f0-9]{64}$/);
  assert.ok(audit(project).artifacts.some((item) => item.path === relative));
});

test('chapter reader review rejects fabricated evidence and inconsistent pass verdict', () => {
  const project = fixtureProject();
  const relative = 'analysis/chapter-reader-review-ch0001-r01.json';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    issues: [{ code: 'BLOCKER', severity: 'critical', evidence: '巷口的人没有散，反而把退路堵住了。', repair: 'Resolve the blocking issue.' }],
  }), null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    issues: [{ code: 'FABRICATED', severity: 'critical', evidence: '这句话不在正文里。', repair: 'Use an actual quote.' }],
  }), null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    rhythm: { pressure: 'flat', hook_type: 'risk', payoff_type: 'loss' },
  }), null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
});

test('missing visible payoff forces revision and blocks a pass verdict', () => {
  const project = fixtureProject();
  const relative = 'analysis/chapter-reader-review-ch0001-r01.json';
  const incomplete = {
    ...report().scene_evidence,
    payoff: { status: 'missing', evidence: '', note: 'The chapter provides no reader-visible result, answer, gain, loss, or new fact.' },
  };
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    verdict: 'revise', scene_evidence: incomplete,
  }), null, 2), 'utf8');
  const result = readerReview.validate(project, { chapter: '1', file: relative });
  assert.equal(result.data.should_revise, true);
  assert.deepEqual(result.data.scene_missing, ['payoff']);
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    verdict: 'pass', scene_evidence: incomplete,
  }), null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
});

test('schema 1.4 binds a focused editorial-dimension pass to literal chapter evidence', () => {
  const project = fixtureProject();
  const relative = 'analysis/chapter-reader-review-ch0001-r01.json';
  const evidence = '林越把欠条按在柜台上，雨水顺着他的手背滴落。';
  const complete = readerReview.EDITORIAL_DIMENSIONS.map((dimension) => ({
    id: dimension.id, verdict: 'pass', evidence, note: `Literal scene evidence supports ${dimension.id}.`,
  }));
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({ schema_version: '1.4' }), null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({ schema_version: '1.4', verdict: 'revise', editorial_dimension_checks: complete.map((item) => item.id === 'outline_delivery' ? { ...item, verdict: 'fail', note: 'The prose summarizes the promised decisive movement.' } : item) }), null, 2), 'utf8');
  const result = readerReview.validate(project, { chapter: '1', file: relative });
  assert.equal(result.data.schema_version, '1.5');
  assert.deepEqual(result.data.editorial_dimension_failures, ['outline_delivery']);
  assert.equal(result.data.should_revise, true);
});


test('schema 1.5 turns stale-hook movement into literal cold-reader proof', () => {
  const project = fixtureProject();
  const relative = 'analysis/chapter-reader-review-ch0001-r01.json';
  const evidence = report().scene_evidence.goal.evidence;
  const complete = readerReview.EDITORIAL_DIMENSIONS.map((dimension) => ({
    id: dimension.id, verdict: 'pass', evidence, note: `Literal scene evidence supports ${dimension.id}.`,
  }));
  fs.writeFileSync(path.join(project, 'state', 'hook-agenda.json'), JSON.stringify({
    schema_version: '1.0', target_chapter: 1,
    must_advance: [{ id: 'F-01', content: 'the marked receipt', last_advanced_chapter: 1, payoff_deadline_chapter: 3 }],
    active_hooks: [], stale_debt: [], eligible_resolve: [], warnings: [], recommendations: [], audit: {},
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    schema_version: '1.5', verdict: 'revise', editorial_dimension_checks: complete,
    hook_agenda_checks: [{ id: 'F-01', verdict: 'fail', evidence, note: 'The receipt is repeated but receives no new evidence, consequence, escalation, or payoff.' }],
  }), null, 2), 'utf8');
  const result = readerReview.validate(project, { chapter: '1', file: relative });
  assert.equal(result.data.schema_version, '1.5');
  assert.deepEqual(result.data.must_advance_hooks_due.map((hook) => hook.id), ['F-01']);
  assert.deepEqual(result.data.hook_agenda_failures, ['F-01']);
  assert.equal(result.data.should_revise, true);

  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    schema_version: '1.4', verdict: 'revise', editorial_dimension_checks: complete,
  }), null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');

  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    schema_version: '1.5', verdict: 'pass', editorial_dimension_checks: complete,
  }), null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
});
