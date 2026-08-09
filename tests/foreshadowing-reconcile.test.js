'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const chapterFacts = require('../skill/long-novel-writer/scripts/chapter-facts');
const reconcile = require('../skill/long-novel-writer/scripts/foreshadowing-reconcile');
const { build: contextBuild } = require('../skill/long-novel-writer/scripts/context-pack');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-foreshadow-progress-'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'foreshadow-progress'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).project;
}

function manuscript(project, chapter, body) {
  const file = path.join(project, 'manuscript', `ch-${String(chapter).padStart(4, '0')}-fixture.md`);
  fs.writeFileSync(file, `# Chapter ${chapter}\n\n${body}\n`, 'utf8');
}

function facts(project, chapter, kind, subject, evidence) {
  const relative = `analysis/chapter-facts-ch${String(chapter).padStart(4, '0')}.json`;
  fs.writeFileSync(path.join(project, relative), JSON.stringify({
    schema_version: '1.0', chapter, extractor_id: 'fixture-extractor', summary: `Chapter ${chapter} establishes one thread fact.`,
    facts: [{ kind, subject, claim: `${kind} ${subject}`, evidence }],
  }, null, 2), 'utf8');
  chapterFacts.validate(project, { chapter: String(chapter), file: relative });
}

function plan(project, rows) {
  fs.writeFileSync(path.join(project, 'outline', 'foreshadowing-ledger.md'), [
    '# Foreshadowing', '',
    '| ID | Setup | Content | Reinforcement | Payoff | Status |',
    '|---|---:|---|---:|---:|---|',
    ...rows,
  ].join('\n'), 'utf8');
}

test('reconcile distinguishes planned threads from literal opening, reinforcement, and closure evidence', () => {
  const project = projectOf();
  plan(project, ['| F-01 | 1 | marked coin | 2 | 3 | open |']);
  manuscript(project, 1, 'The marked coin passes to Lin.');
  facts(project, 1, 'hook_open', 'f-01', 'The marked coin passes to Lin.');
  manuscript(project, 2, 'Lin recognises the marked coin at the gate.');
  facts(project, 2, 'hook_open', 'F-01', 'Lin recognises the marked coin at the gate.');
  manuscript(project, 3, 'The coin opens the gate and reveals its owner.');
  facts(project, 3, 'hook_closed', 'F-01', 'The coin opens the gate and reveals its owner.');
  const report = reconcile.write(project, { chapter: '3' });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.audit.resolved, 1);
  const persisted = JSON.parse(fs.readFileSync(path.join(project, reconcile.OUTPUT), 'utf8'));
  assert.equal(persisted.entries[0].status, 'resolved');
  assert.equal(persisted.entries[0].observed.setup_evidence.length, 1);
  assert.equal(persisted.entries[0].observed.reinforcement_evidence[0].evidence.length, 1);
  assert.equal(persisted.entries[0].observed.closed[0].chapter, 3);
  const context = contextBuild(project, { chapter: '4', budget: '12000' });
  assert.ok(context.manifest.sources.some((item) => item.path === reconcile.OUTPUT && item.tier === 'critical'));
});

test('reconcile rejects a scheduled payoff with no accepted-page closure and reports unknown hook IDs', () => {
  const project = projectOf();
  plan(project, ['| F-01 | 1 | marked coin |  | 1 | open |']);
  manuscript(project, 1, 'The marked coin passes to Lin.');
  facts(project, 1, 'hook_open', 'F-99', 'The marked coin passes to Lin.');
  const report = reconcile.write(project, { chapter: '1' });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'FORESHADOW_PAYOFF_DUE_UNPROVEN' && item.id === 'F-01'));
  assert.ok(report.warnings.some((item) => item.code === 'FORESHADOW_FACT_UNKNOWN_ID' && item.subject === 'F-99'));
});
