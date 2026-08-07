'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validate } = require('../skill/long-novel-writer/scripts/evidence-audit');

test('evidence audit accepts target anchors with exact source quotes', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-evidence-'));
  fs.mkdirSync(path.join(project, 'manuscript'), { recursive: true });
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0001-test.md'), '# 第一章\n\n门突然开了。', 'utf8');
  const report = validate(project, {
    reviewed_through: 1,
    target_anchors: [{ id: 'C1', target: '危机出现', status: 'fulfilled', evidence: [{ path: 'manuscript/ch-0001-test.md', quote: '门突然开了。' }] }],
    findings: [],
    reader_reports: [{ summary: '清楚', confusions: [], continue_next: true }],
  });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.anchor_coverage, 1);
});

test('evidence audit rejects claims whose quote is absent', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-evidence-bad-'));
  fs.mkdirSync(path.join(project, 'manuscript'), { recursive: true });
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0001-test.md'), '# 第一章\n', 'utf8');
  const report = validate(project, { target_anchors: [{ id: 'C1', target: '危机出现', status: 'fulfilled', evidence: [{ path: 'manuscript/ch-0001-test.md', quote: '不存在的兑现' }] }] });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'EVIDENCE_QUOTE_MISSING'));
});
