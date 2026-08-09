#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const TRACKED = [
  'analysis/trend-report.md',
  'analysis/breakdown.md',
  'analysis/qa-report.md',
  'analysis/reader-rejection-2026-08-08.md',
  'outline/master-outline.md',
  'outline/chapter-beats.md',
  'settings/reader-contract.md',
  'settings/platform-contract.md',
  'settings/platform-classroom-map.md',
  'settings/author-intent.md',
  'settings/context-policy.json',
  'settings/workflow-policy.json',
  'evidence/sources/source-index.md',
  'evidence/sources/writer-classroom-index.md',
  'evidence/derivations/decision-log.md',
  'evidence/derivations/style-signals.md',
  'evidence/derivations/character-contracts.md',
  'supervision/dashboard.md',
  'supervision/review-queue.md',
  'supervision/stop-conditions.md',
  'state/workflow-run.json',
  'state/workflow-ledger.jsonl',
  'state/post-hoc-ledger.jsonl',
  'state/autopilot-run.json',
  'state/autopilot-run-ledger.jsonl',
  'state/current-focus.md',
  'state/feedback-rules.json',
  'state/style-contract.json',
  'state/character-contracts.json',
  'state/foreshadowing-index.json',
  'state/foreshadowing-progress.json',
  'state/hook-agenda.json',
  'state/resource-ledger.json',
  'state/resource-window.json',
  'state/pacing-ledger.json',
  'state/quality-trend-ledger.json',
  'state/quality-guidance.json',
  'state/repair-debt-ledger.json',
  'state/repair-debt-guidance.json',
];

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) args[value.slice(2)] = argv[++index] ?? true;
    else if (!args.project) args.project = value;
  }
  return args;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { throw new CliError('JSON_INVALID', `读取失败：${path.basename(file)}`, { file, message: error.message }); }
}

function dynamicTracked(project) {
  const roots = [
    { relative: 'state/chapter-memory', match: /^ch-\d{4}\.json$/i },
    { relative: 'state/fact-ledger', match: /^ch-\d{4}\.json$/i },
    { relative: 'state/chapter-cards', match: /^ch-\d{4}\.json$/i },
    { relative: 'state/chapter-revisions', match: /^ch-\d{4}-r\d{2}\.(?:md|json)$/i },
    { relative: 'analysis', match: /^chapter-reader-review-ch\d{4}-r\d{2}\.json$/i },
    { relative: 'analysis', match: /^chapter-facts-ch\d{4}\.json$/i },
  ];
  return roots.flatMap(({ relative, match }) => {
    const directory = path.join(project, relative);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter((name) => match.test(name)).sort().map((name) => `${relative}/${name}`);
  });
}

function audit(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  if (!fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', '项目目录不存在', { project });
  const tracked = [...new Set([...TRACKED, ...dynamicTracked(project)])].sort();
  const files = tracked.filter((relative) => fs.existsSync(path.join(project, relative))).map((relative) => {
    const file = path.join(project, relative);
    const stat = fs.statSync(file);
    return { path: relative, bytes: stat.size, sha256: sha256(file) };
  });
  const state = readJson(path.join(project, 'state', 'project-state.json'), {});
  const autopilot = readJson(path.join(project, 'state', 'autopilot.json'), {});
  const autoPilot = readJson(path.join(project, 'state', 'autopilot-pilot.json'), {});
  const humanPilot = readJson(path.join(project, 'state', 'pilot-verdict.json'), {});
  const report = {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    project,
    state: { updated_through: Number(state.updated_through || 0), target_words: Number(state.target_words || 0) },
    supervision: {
      mode: autopilot.mode || 'supervised',
      status: autopilot.status || 'idle',
      phase: autopilot.phase || 'idle',
      release_to_scale: (autoPilot.status === 'approved' && autoPilot.auto_confirmed === true && Number(autoPilot.reviewed_through || 0) >= 3)
        || (humanPilot.status === 'approved' && humanPilot.human_confirmed === true && Number(humanPilot.reviewed_through || 0) >= 3),
      auto_pilot: autoPilot.status || 'pending',
      human_pilot: humanPilot.status || 'pending',
    },
    missing_supervision_files: ['supervision/dashboard.md', 'supervision/review-queue.md', 'supervision/decision-log.md', 'supervision/stop-conditions.md'].filter((relative) => !fs.existsSync(path.join(project, relative))),
    artifacts: files,
  };
  if (options['write-manifest'] === true) {
    const manifestFile = path.join(project, 'evidence', 'lineage', 'manifest.json');
    const current = readJson(manifestFile, { schema_version: '1.0', artifacts: [] });
    const byPath = new Map((current.artifacts || []).map((item) => [item.path, item]));
    for (const item of files) byPath.set(item.path, { ...(byPath.get(item.path) || {}), path: item.path, sha256: item.sha256, bytes: item.bytes });
    const next = { ...current, schema_version: '1.0', generated_at: report.generated_at, artifacts: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)) };
    atomicWrite(manifestFile, `${JSON.stringify(next, null, 2)}\n`);
    report.manifest = path.relative(project, manifestFile).replace(/\\/g, '/');
  }
  return report;
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project) throw new CliError('USAGE', '用法: node project-audit.js <项目目录> [--write-manifest]');
  const report = audit(args.project, args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'project-audit'); }
}

module.exports = { TRACKED, argsOf, sha256, dynamicTracked, audit, run };
