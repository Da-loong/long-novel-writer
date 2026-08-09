'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const repairDebt = require('../skill/long-novel-writer/scripts/repair-debt-ledger');
const { build: contextBuild } = require('../skill/long-novel-writer/scripts/context-pack');
const { audit: projectAudit } = require('../skill/long-novel-writer/scripts/project-audit');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-repair-debt-'));
  const init = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'repair-debt'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  return JSON.parse(init.stdout).project;
}

function writeReport(project, chapter, round, value) {
  const file = path.join(project, 'analysis', `chapter-reader-review-ch${String(chapter).padStart(4, '0')}-r${String(round).padStart(2, '0')}.json`);
  fs.writeFileSync(file, JSON.stringify({
    schema_version: '1.5', chapter, verdict: value.should_revise ? 'revise' : 'pass', should_revise: Boolean(value.should_revise),
    manuscript_sha256: `${chapter}-${round}`, scores: value.scores || { clarity: 7, continuation: 7, fanqie_fit: 7, character_agency: 7, payoff: 7 },
    issues: value.issues || [], low_scores: value.low_scores || [], scene_missing: value.scene_missing || [], feedback_rule_failures: value.feedback_rule_failures || [], style_signal_failures: value.style_signal_failures || [], character_contract_failures: value.character_contract_failures || [], editorial_dimension_failures: value.editorial_dimension_failures || [], hook_agenda_failures: value.hook_agenda_failures || [], chapter_obligation_failures: value.chapter_obligation_failures || [],
  }, null, 2), 'utf8');
}

test('repair debt preserves repeated failed-reader obligations even after a later accepted revision', () => {
  const project = projectOf();
  const shared = { should_revise: true, low_scores: ['continuation'], scene_missing: ['payoff'], editorial_dimension_failures: ['outline_delivery'], chapter_obligation_failures: ['beat_turn'], issues: [{ code: 'PAYOFF_DELAYED' }] };
  writeReport(project, 1, 1, shared);
  writeReport(project, 1, 2, shared);
  writeReport(project, 1, 3, { should_revise: false, scores: { clarity: 8, continuation: 8, fanqie_fit: 8, character_agency: 8, payoff: 8 } });

  writeReport(project, 2, 1, { should_revise: true, low_scores: ['clarity'], issues: [{ code: 'EXPOSITION' }] });
  writeReport(project, 2, 2, { should_revise: true, low_scores: ['payoff'], issues: [{ code: 'NO_RESULT' }] });

  const result = repairDebt.write(project, { chapter: '3' });
  assert.equal(result.ledger.entries.length, 2);
  const repaired = result.ledger.entries.find((entry) => entry.chapter === 1);
  assert.equal(repaired.final_status, 'repaired');
  assert.equal(repaired.root_cause, 'contract_delivery');
  assert.ok(repaired.repeated_debt_keys.includes('scene:payoff'));
  assert.ok(repaired.repeated_delivery_keys.includes('obligation:beat_turn'));
  const drifting = result.ledger.entries.find((entry) => entry.chapter === 2);
  assert.equal(drifting.root_cause, 'diagnostic_drift');
  assert.equal(result.guidance.primary_root_cause, 'contract_delivery');
  assert.match(result.guidance.recommendation, /goal, obstacle, turn, cost, information, emotion, and hook/i);
  assert.ok(fs.existsSync(path.join(project, repairDebt.LEDGER_FILE)));
  assert.ok(fs.existsSync(path.join(project, repairDebt.GUIDANCE_FILE)));

  const pack = contextBuild(project, { chapter: '3', budget: '12000' });
  assert.ok(pack.manifest.sources.some((item) => item.path === repairDebt.GUIDANCE_FILE && item.tier === 'critical'));
  const audited = projectAudit(project);
  assert.ok(audited.artifacts.some((item) => item.path === repairDebt.LEDGER_FILE));
  assert.ok(audited.artifacts.some((item) => item.path === repairDebt.GUIDANCE_FILE));
});

test('repair debt marks an unpassed final round after the configured revision budget is consumed', () => {
  const project = projectOf();
  for (let round = 1; round <= 3; round++) writeReport(project, 1, round, { should_revise: true, low_scores: ['clarity'], issues: [{ code: 'CLARITY' }] });
  const result = repairDebt.write(project, { chapter: '2' });
  assert.equal(result.ledger.entries[0].final_status, 'unresolved');
  assert.equal(result.ledger.entries[0].root_cause, 'budget_exhausted');
  assert.deepEqual(result.ledger.audit.unresolved_chapters, [1]);
  assert.match(result.guidance.recommendation, /budget was exhausted/i);
});
