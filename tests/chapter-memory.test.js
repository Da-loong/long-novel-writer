'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const memory = require('../skill/long-novel-writer/scripts/chapter-memory');

function projectOf() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-memory-'));
  fs.mkdirSync(path.join(project, 'manuscript'), { recursive: true });
  fs.mkdirSync(path.join(project, 'state'), { recursive: true });
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0001-start.md'), '# Start\n\nOpening action.\n\nA choice changes the room.\n\nA new question waits.\n', 'utf8');
  fs.writeFileSync(path.join(project, 'state', 'current-state.md'), '# State\n\nchapter: 1\n', 'utf8');
  return project;
}

test('chapter memory captures a bounded capsule and hash-bound source', () => {
  const project = projectOf();
  const captured = memory.capture(project, { chapter: '1' });
  assert.equal(captured.capsule.opening, 'Opening action.');
  assert.equal(captured.capsule.ending, 'A new question waits.');
  const report = memory.validate(project, { chapter: '1' });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.ok(fs.existsSync(captured.output));
});

test('chapter memory carries hash-bound fact and reader-review settlement receipts', () => {
  const project = projectOf();
  fs.mkdirSync(path.join(project, 'state', 'fact-ledger'), { recursive: true });
  fs.mkdirSync(path.join(project, 'analysis'), { recursive: true });
  fs.writeFileSync(path.join(project, 'state', 'fact-ledger', 'ch-0001.json'), JSON.stringify({
    chapter: 1, summary: 'The choice exposes a new threat.', facts: [{ kind: 'event' }],
  }), 'utf8');
  fs.writeFileSync(path.join(project, 'analysis', 'chapter-reader-review-ch0001.json'), JSON.stringify({
    chapter: 1, verdict: 'pass', scores: { clarity: 8 }, issues: [],
  }), 'utf8');
  const captured = memory.capture(project, { chapter: '1' });
  assert.deepEqual(captured.settlement_receipts.map((item) => item.kind), ['chapter_facts', 'reader_review']);
  assert.equal(memory.validate(project, { chapter: '1' }).ok, true);
  fs.appendFileSync(path.join(project, 'analysis', 'chapter-reader-review-ch0001.json'), '\n', 'utf8');
  const report = memory.validate(project, { chapter: '1' });
  assert.ok(report.errors.some((item) => item.code === 'MEMORY_RECEIPT_HASH_MISMATCH'));
});

test('chapter memory detects manuscript drift', () => {
  const project = projectOf();
  memory.capture(project, { chapter: '1' });
  fs.appendFileSync(path.join(project, 'manuscript', 'ch-0001-start.md'), '\nChanged later.\n', 'utf8');
  const report = memory.validate(project, { chapter: '1' });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'MEMORY_MANUSCRIPT_HASH_MISMATCH'));
});
