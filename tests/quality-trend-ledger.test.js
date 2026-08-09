'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const qualityTrend = require('../skill/long-novel-writer/scripts/quality-trend-ledger');
const { build: contextBuild } = require('../skill/long-novel-writer/scripts/context-pack');
const { audit: projectAudit } = require('../skill/long-novel-writer/scripts/project-audit');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-quality-trend-'));
  const init = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'quality-trend'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  return JSON.parse(init.stdout).project;
}

function writeAcceptedReport(project, chapter, scores, options = {}) {
  const text = `# Chapter ${chapter}\n\nLin makes a choice, pays the cost, and opens the next question.\n`;
  const manuscript = path.join(project, 'manuscript', `ch-${String(chapter).padStart(4, '0')}-test.md`);
  fs.writeFileSync(manuscript, text, 'utf8');
  const report = {
    schema_version: '1.5', chapter, verdict: 'pass', should_revise: false,
    manuscript_sha256: options.manuscript_sha256 || hash(text),
    scores,
  };
  const round = String(options.round || 1).padStart(2, '0');
  fs.writeFileSync(path.join(project, 'analysis', `chapter-reader-review-ch${String(chapter).padStart(4, '0')}-r${round}.json`), JSON.stringify(report, null, 2), 'utf8');
  return { text, manuscript, report };
}

test('quality trend consumes only final hash-matched accepted cold-reader evidence and guides the next chapter', () => {
  const project = projectOf();
  for (let chapter = 1; chapter <= 6; chapter++) {
    const scores = chapter <= 3
      ? { clarity: 9, continuation: 9, fanqie_fit: 9, character_agency: 9, payoff: 9 }
      : { clarity: 8, continuation: 7, fanqie_fit: 8, character_agency: 8, payoff: 8 };
    writeAcceptedReport(project, chapter, scores);
  }
  writeAcceptedReport(project, 6, { clarity: 10, continuation: 10, fanqie_fit: 10, character_agency: 10, payoff: 10 }, { round: 2, manuscript_sha256: 'stale-manuscript-hash' });

  const result = qualityTrend.write(project, { chapter: '7' });
  assert.equal(result.ledger.entries.length, 6);
  assert.equal(result.ledger.entries.at(-1).review, 'analysis/chapter-reader-review-ch0006-r01.json');
  assert.equal(result.ledger.audit.weakest_dimension.dimension, 'continuation');
  assert.equal(result.ledger.audit.trend, 'declining');
  assert.ok(result.ledger.audit.warnings.some((item) => item.code === 'QUALITY_SCORE_DROP'));
  assert.ok(result.ledger.audit.warnings.some((item) => item.code === 'QUALITY_DIMENSION_STREAK' && item.dimension === 'continuation'));
  assert.equal(result.guidance.target_chapter, 7);
  assert.match(result.guidance.weakest_dimension.focus, /concrete changed situation/i);
  assert.ok(fs.existsSync(path.join(project, qualityTrend.LEDGER_FILE)));
  assert.ok(fs.existsSync(path.join(project, qualityTrend.GUIDANCE_FILE)));

  const pack = contextBuild(project, { chapter: '7', budget: '12000' });
  assert.ok(pack.manifest.sources.some((item) => item.path === qualityTrend.GUIDANCE_FILE && item.tier === 'critical'));
  const audited = projectAudit(project);
  assert.ok(audited.artifacts.some((item) => item.path === qualityTrend.LEDGER_FILE));
  assert.ok(audited.artifacts.some((item) => item.path === qualityTrend.GUIDANCE_FILE));
});

test('quality trend keeps the initial diagnostic stable when no accepted reader history exists', () => {
  const project = projectOf();
  const result = qualityTrend.write(project, { chapter: '1' });
  assert.equal(result.ledger.entries.length, 0);
  assert.equal(result.guidance.trend, 'insufficient_data');
  assert.equal(result.guidance.recommendations.length, 1);
  assert.equal(qualityTrend.inspect(project).entries, 0);
});
