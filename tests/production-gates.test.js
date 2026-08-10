'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const deep = require('../skill/long-novel-writer/scripts/deep-breakdown-gate');
const longform = require('../skill/long-novel-writer/scripts/longform-gate');
const platform = require('../skill/long-novel-writer/scripts/platform-feedback');
const readiness = require('../skill/long-novel-writer/scripts/production-readiness');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-production-gates-'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'gate-test', '--target-words', '1000000'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).project;
}

test('deep breakdown gate requires traceable multi-book evidence and passes a complete fixture', () => {
  const project = projectOf();
  const initial = deep.validate(project);
  assert.equal(initial.ok, false);
  assert.ok(initial.errors.some((item) => item.code === 'BENCHMARK_POOL_TOO_SMALL'));
  const ids = Array.from({ length: 10 }, (_, index) => `B${String(index + 1).padStart(2, '0')}`);
  const poolRows = ids.map((id) => `| ${id} | Work ${id} | urban | rank evidence | opening+latest | ranking-snapshot | selected |`).join('\n');
  fs.writeFileSync(path.join(project, 'evidence', 'derivations', 'benchmark-pool.md'), `# Pool\n\n| ID | Work | Track | Selection | Scope | Source | Status |\n|---|---|---|---|---|---|---|\n${poolRows}\n`, 'utf8');
  const dimensions = 'market promise framework structure plot conflict character relationship chapter rhythm prose dialogue retention hooks '; 
  fs.writeFileSync(path.join(project, 'analysis', 'breakdown.md'), `# Breakdown\n\n${dimensions.repeat(30)}\nSources: ${ids.join(', ')}.\n`, 'utf8');
  fs.writeFileSync(path.join(project, 'evidence', 'derivations', 'benchmark-feature-matrix.md'), '# Matrix\n\nObserved across B01 and B02; abstract mechanism rows only.\n', 'utf8');
  fs.writeFileSync(path.join(project, 'evidence', 'derivations', 'source-boundaries.md'), `# Boundaries\n\n${'Source wording, names, scenes, settings, plot chains, and character configurations remain excluded. '.repeat(8)}\n`, 'utf8');
  const complete = deep.validate(project);
  assert.equal(complete.ok, true, JSON.stringify(complete.errors));
});

test('longform gate is advisory before checkpoint and readiness exposes the remaining evidence', () => {
  const project = projectOf();
  const health = longform.validate(project);
  assert.equal(health.ok, true);
  assert.equal(health.checkpoints.find((item) => item.chapter === 10).applicable, false);
  const report = readiness.validate(project);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'TARGET_WORDS_BELOW_MILLION') === false);
  assert.ok(report.gates.preproduction.ok === false);
});

test('platform feedback keeps a hash-bound export and emits bounded feedback rules', () => {
  const project = projectOf();
  const input = path.join(project, 'metrics.csv');
  fs.writeFileSync(input, 'chapter,impressions,readers,follows,finish_rate,retention\n1,1000,100,20,0.8,0.7\n2,1000,80,10,0.6,0.5\n3,1000,70,8,0.5,0.4\n4,1000,60,5,0.4,0.3\n5,1000,50,4,0.3,0.2\n6,1000,40,3,0.2,0.1\n', 'utf8');
  const report = platform.ingest(project, { input });
  assert.equal(report.ok, true);
  assert.ok(report.feedback_rules >= 1);
  const data = JSON.parse(fs.readFileSync(path.join(project, 'state', 'platform-metrics.json'), 'utf8'));
  assert.match(data.source_sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'state', 'platform-feedback-rules.json'), 'utf8')).rules.length, report.feedback_rules);
});
