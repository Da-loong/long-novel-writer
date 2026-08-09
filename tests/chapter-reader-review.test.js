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
      hook: { status: 'present', evidence: '巷口的人没有散，反而把退路堵住了。', note: 'The blocked exit leaves an immediate question.' },
    },
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
});

test('missing scene evidence forces revision and blocks a pass verdict', () => {
  const project = fixtureProject();
  const relative = 'analysis/chapter-reader-review-ch0001-r01.json';
  const incomplete = {
    ...report().scene_evidence,
    hook: { status: 'missing', evidence: '', note: 'The ending creates no concrete next-reading question.' },
  };
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    verdict: 'revise', scene_evidence: incomplete,
  }), null, 2), 'utf8');
  const result = readerReview.validate(project, { chapter: '1', file: relative });
  assert.equal(result.data.should_revise, true);
  assert.deepEqual(result.data.scene_missing, ['hook']);
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    verdict: 'pass', scene_evidence: incomplete,
  }), null, 2), 'utf8');
  assert.throws(() => readerReview.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_READER_REVIEW_INVALID');
});
