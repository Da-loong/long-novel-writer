#!/usr/bin/env node
'use strict';

/* Checkpoint gate for serialization health at 10/30/100/400 chapters. */
const fs = require('fs');
const path = require('path');
const { CliError, emitError } = require('./cap-utils');

const CHECKPOINTS = [10, 30, 100, 400];
const QUALITY_FLOOR = 7;
const HEALTH_WARNINGS = new Set(['SUBPLOT_STALL', 'RELATIONSHIP_STALL', 'PROGRESSION_DECAY', 'VOLUME_FATIGUE', 'ENDING_PAYOFF_COVERAGE_LOW']);

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value.startsWith('--')) {
      const next = argv[i + 1];
      out[value.slice(2)] = next !== undefined && !next.startsWith('--') ? next : true;
      if (out[value.slice(2)] !== true) i++;
    } else if (!out.command) out.command = value;
    else if (!out.project) out.project = value;
  }
  return out;
}

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function json(project, relative, fallback = null) {
  const file = path.join(project, relative);
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (_) { return fallback; }
}

function reviewFile(project, chapter) {
  const file = path.join(project, 'analysis', `review-${String(chapter).padStart(4, '0')}.md`);
  return fs.existsSync(file) && fs.statSync(file).size >= 100 ? `analysis/review-${String(chapter).padStart(4, '0')}.md` : null;
}

function qualitySummary(project, chapter) {
  const ledger = json(project, 'state/quality-trend-ledger.json', { entries: [], audit: {} });
  const entries = Array.isArray(ledger.entries) ? ledger.entries.filter((item) => Number(item.chapter) <= chapter).sort((a, b) => Number(a.chapter) - Number(b.chapter)) : [];
  const recent = entries.slice(-3);
  const scores = recent.map((item) => Number(item.mean_score)).filter(Number.isFinite);
  return { entries: entries.length, recent_chapters: recent.map((item) => Number(item.chapter)), recent_average: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null, trend: ledger.audit?.trend || 'insufficient_data' };
}

function checkpoint(project, chapter) {
  const errors = [];
  const review = reviewFile(project, chapter);
  if (!review) errors.push({ code: 'LONGFORM_REVIEW_MISSING', chapter, expected: `analysis/review-${String(chapter).padStart(4, '0')}.md` });
  const quality = qualitySummary(project, chapter);
  if (quality.entries < chapter - 1) errors.push({ code: 'LONGFORM_QUALITY_HISTORY_SHORT', chapter, entries: quality.entries, minimum: chapter - 1 });
  if (quality.recent_average !== null && quality.recent_average < QUALITY_FLOOR) errors.push({ code: 'LONGFORM_QUALITY_FLOOR', chapter, recent_average: quality.recent_average, minimum: QUALITY_FLOOR });
  if (quality.trend === 'declining') errors.push({ code: 'LONGFORM_QUALITY_DECLINING', chapter });
  const debt = json(project, 'state/repair-debt-ledger.json', { audit: {}, entries: [] });
  const unresolved = Array.isArray(debt.audit?.unresolved_chapters) ? debt.audit.unresolved_chapters.filter((item) => Number(item) <= chapter) : [];
  if (unresolved.length) errors.push({ code: 'LONGFORM_REPAIR_DEBT_OPEN', chapter, unresolved_chapters: unresolved });
  const health = json(project, 'state/longform-health.json', { chapter: 0, next_gate: 'unknown', warnings: [] });
  const healthWarnings = (health.warnings || []).filter((item) => HEALTH_WARNINGS.has(item.code));
  if (Number(health.chapter || 0) < chapter) errors.push({ code: 'LONGFORM_HEALTH_STALE', chapter, health_chapter: Number(health.chapter || 0) });
  if (health.next_gate && health.next_gate !== 'healthy') errors.push({ code: 'LONGFORM_HEALTH_NOT_HEALTHY', chapter, next_gate: health.next_gate });
  for (const warning of healthWarnings) errors.push({ code: warning.code, chapter, source: 'state/longform-health.json' });
  return { chapter, applicable: true, review, quality, unresolved_repair_debt: unresolved, health_warnings: healthWarnings, errors, ok: errors.length === 0 };
}

function validate(projectInput) {
  const project = projectOf(projectInput);
  const state = json(project, 'state/project-state.json', {});
  const currentChapter = Number(state.updated_through || 0);
  const applicable = CHECKPOINTS.filter((chapter) => chapter <= currentChapter);
  const checkpoints = applicable.map((chapter) => checkpoint(project, chapter));
  const errors = checkpoints.flatMap((item) => item.errors);
  return { ok: errors.length === 0, command: 'longform-gate', project, current_chapter: currentChapter, checkpoints: CHECKPOINTS.map((chapter) => ({ chapter, applicable: chapter <= currentChapter, ...(chapter <= currentChapter ? checkpoints.find((item) => item.chapter === chapter) : {}) })), errors, next: errors.length ? 'repair the cited checkpoint debt before producing the next volume' : applicable.length ? 'longform checkpoints are healthy' : 'no longform checkpoint is due yet; smoke gate remains the first release gate' };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project) throw new CliError('USAGE', 'Usage: node longform-gate.js <PROJECT>');
  const report = validate(args.project);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 3;
  return report;
}

if (require.main === module) { try { run(); } catch (error) { process.exitCode = emitError(error, 'longform-gate'); } }
module.exports = { CHECKPOINTS, QUALITY_FLOOR, HEALTH_WARNINGS, argsOf, projectOf, json, reviewFile, qualitySummary, checkpoint, validate, run };
