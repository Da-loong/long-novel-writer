'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const chapterFacts = require('../skill/long-novel-writer/scripts/chapter-facts');
const resourceLedger = require('../skill/long-novel-writer/scripts/resource-ledger');
const { build: contextBuild } = require('../skill/long-novel-writer/scripts/context-pack');
const { audit } = require('../skill/long-novel-writer/scripts/project-audit');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-resource-ledger-'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'resource-ledger'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).project;
}

function writeChapter(project, chapter, body) {
  fs.writeFileSync(path.join(project, 'manuscript', `ch-${String(chapter).padStart(4, '0')}-resource.md`), `# Resource ${chapter}\n\n${body}\n`, 'utf8');
}

function resourceFact(chapter, evidence, resource) {
  return {
    schema_version: '1.1', chapter, extractor_id: 'resource-fixture', summary: 'An evidence-bound resource state changes.',
    facts: [{ kind: 'resource', subject: resource.holder, claim: `${resource.key} ${resource.action}.`, evidence, resource }],
  };
}

function validateFact(project, chapter, payload) {
  const relative = `analysis/chapter-facts-ch${String(chapter).padStart(4, '0')}.json`;
  fs.writeFileSync(path.join(project, relative), JSON.stringify(payload, null, 2), 'utf8');
  return chapterFacts.validate(project, { chapter: String(chapter), file: relative });
}

test('resource ledger keeps only literal resource deltas and clips the next chapter window', () => {
  const project = projectOf();
  const acquired = 'Lin takes the brass key from the locked drawer.';
  writeChapter(project, 1, acquired);
  validateFact(project, 1, resourceFact(1, acquired, {
    holder: 'Lin', key: 'brass key', type: 'physical_item', action: 'acquired', status_after: 'available', risk: 'high', expected_use_by_chapter: 8,
  }));
  fs.writeFileSync(path.join(project, 'outline', 'chapter-beats.md'), '# Beats\n\n| No | POV | Goal | Obstacle | Turn | Cost | Information | Emotion | Hook |\n|---:|---|---|---|---|---|---|---|---|\n| 2 | Lin | use brass key | locked gate | choose entry | exposure | room number | tension | alarm |\n', 'utf8');
  const first = resourceLedger.write(project, { chapter: '2' });
  assert.equal(first.audit.active_resources, 1);
  assert.equal(first.window.resources.length, 1);
  assert.equal(first.window.resources[0].holder, 'Lin');
  assert.equal(first.window.resources[0].status, 'available');
  assert.ok(audit(project).artifacts.some((item) => item.path === resourceLedger.OUTPUT));
  assert.ok(audit(project).artifacts.some((item) => item.path === resourceLedger.WINDOW_OUTPUT));
  const pack = contextBuild(project, { chapter: '2', budget: '18000' });
  assert.ok(pack.manifest.sources.some((item) => item.path === resourceLedger.WINDOW_OUTPUT && item.tier === 'critical'));

  const stale = resourceLedger.write(project, { chapter: '14', 'stale-after': '12' });
  assert.deepEqual(stale.data.stale_resources, ['lin\u0000brass key']);
  assert.ok(stale.warnings.some((warning) => warning.code === 'RESOURCE_STALE'));

  const consumed = 'Lin spends the brass key to open the gate.';
  writeChapter(project, 2, consumed);
  validateFact(project, 2, resourceFact(2, consumed, {
    holder: 'Lin', key: 'brass key', type: 'physical_item', action: 'consumed', status_after: 'consumed', risk: 'high', expected_use_by_chapter: null,
  }));
  const afterConsume = resourceLedger.write(project, { chapter: '3' });
  assert.equal(afterConsume.data.resources[0].status, 'consumed');
  assert.equal(afterConsume.audit.active_resources, 0);
  assert.ok(!afterConsume.warnings.some((warning) => warning.code === 'RESOURCE_STATUS_CONFLICT'));
});

test('resource ledger surfaces a literal consumption conflict without inventing a prior owner', () => {
  const project = projectOf();
  const evidence = 'Lin spends the untracked seal before anyone gives it to him.';
  writeChapter(project, 1, evidence);
  validateFact(project, 1, resourceFact(1, evidence, {
    holder: 'Lin', key: 'untracked seal', type: 'credential', action: 'consumed', status_after: 'consumed', risk: 'high', expected_use_by_chapter: null,
  }));
  const report = resourceLedger.write(project, { chapter: '1' });
  assert.ok(report.warnings.some((warning) => warning.code === 'RESOURCE_STATUS_CONFLICT' && warning.key === 'untracked seal'));
});
