#!/usr/bin/env node
'use strict';

/* One status surface for unattended production. It reports evidence readiness,
 * not a promise that prose will be good without running the actual chapters. */
const fs = require('fs');
const path = require('path');
const { CliError, emitError } = require('./cap-utils');
const preproduction = require('./preproduction-gate');
const smoke = require('./smoke-gate');
const longform = require('./longform-gate');

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

function checked(name, fn) {
  try { return { name, applicable: true, ...fn() }; }
  catch (error) { return { name, applicable: true, ok: false, errors: error.details?.errors || [{ code: error.code || 'GATE_ERROR', message: error.message, details: error.details || null }] }; }
}

function panelBoundary(project, currentChapter) {
  const file = path.join(project, 'analysis', 'autopilot-pilot.json');
  if (!fs.existsSync(file)) return { applicable: currentChapter >= 3, ok: currentChapter < 3, errors: currentChapter >= 3 ? [{ code: 'PANEL_EVIDENCE_MISSING' }] : [] };
  const evidence = json(project, 'analysis/autopilot-pilot.json', {});
  const reports = Array.isArray(evidence.reader_reports) ? evidence.reader_reports : [];
  const models = [...new Set(reports.map((item) => String(item.model_id || '').trim()).filter(Boolean))];
  const roles = [...new Set(reports.map((item) => String(item.role_id || '').trim()).filter(Boolean))];
  const mode = evidence.review_mode || (models.length >= 2 ? 'cross_model' : 'single_model_multi_role');
  const errors = [];
  if (reports.length < 3 || roles.length < 3) errors.push({ code: 'PANEL_ROLE_SEPARATION_THIN', reports: reports.length, roles: roles.length, minimum_roles: 3 });
  if (mode === 'cross_model' && models.length < 2) errors.push({ code: 'PANEL_MODE_MISMATCH', mode, models: models.length });
  if (mode === 'single_model_multi_role' && models.length !== 1) errors.push({ code: 'PANEL_SINGLE_MODEL_MISMATCH', mode, models: models.length });
  return { applicable: true, ok: errors.length === 0, mode, independence_class: mode === 'cross_model' ? 'cross_model_independent' : 'role_separated_not_independent', models: models.length, roles: roles.length, errors };
}

function platformFeedbackBoundary(project) {
  const queue = json(project, 'state/publish-queue.json', { items: [] });
  const published = Array.isArray(queue.items) ? queue.items.filter((item) => item.status === 'published') : [];
  const metrics = json(project, 'state/platform-metrics.json', { entries: [] });
  if (!published.length) return { applicable: false, ok: true, published: 0, entries: Array.isArray(metrics.entries) ? metrics.entries.length : 0, reason: 'no confirmed platform publication yet' };
  const entries = Array.isArray(metrics.entries) ? metrics.entries : [];
  const errors = [];
  if (!metrics.source || !metrics.source_sha256 || !entries.length) errors.push({ code: 'PLATFORM_FEEDBACK_MISSING', published: published.length });
  return { applicable: true, ok: errors.length === 0, published: published.length, entries: entries.length, errors };
}

function validate(projectInput) {
  const project = projectOf(projectInput);
  const state = json(project, 'state/project-state.json', {});
  const settings = json(project, 'settings/agent-runner.json', {});
  const currentChapter = Number(state.updated_through || 0);
  const targetWords = Number(state.target_words || 0);
  const errors = [];
  if (targetWords < 1000000) errors.push({ code: 'TARGET_WORDS_BELOW_MILLION', target_words: targetWords, minimum: 1000000 });
  if (Number(settings.chapter_min_chars || 0) < 2000) errors.push({ code: 'CHAPTER_MIN_FLOOR_WEAK', configured: settings.chapter_min_chars, minimum: 2000 });
  const preproductionReport = checked('preproduction', () => preproduction.validate(project));
  const smokeReport = currentChapter >= 3 ? checked('smoke', () => smoke.validate(project, { 'min-chars': String(Math.max(2000, Number(settings.chapter_min_chars || 2000))) })) : { applicable: false, ok: true, reason: 'fewer than three chapters are committed' };
  const longformReport = checked('longform', () => longform.validate(project));
  const panelReport = panelBoundary(project, currentChapter);
  const platformReport = platformFeedbackBoundary(project);
  for (const report of [preproductionReport, smokeReport, longformReport, panelReport, platformReport]) if (report.applicable && report.ok === false) errors.push(...(report.errors || [{ code: `${report.name || 'GATE'}_FAILED` }]));
  return { ok: errors.length === 0, unattended_ready: errors.length === 0, command: 'production-readiness', project, target_words: targetWords, current_chapter: currentChapter, gates: { preproduction: preproductionReport, smoke: smokeReport, longform: longformReport, panel: panelReport, platform_feedback: platformReport }, errors, boundary: 'A passing report means the evidence and deterministic gates are ready for unattended execution. It is not a substitute for fresh chapter receipts or reader outcomes.' };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project) throw new CliError('USAGE', 'Usage: node production-readiness.js <PROJECT>');
  const report = validate(args.project);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 3;
  return report;
}

if (require.main === module) { try { run(); } catch (error) { process.exitCode = emitError(error, 'production-readiness'); } }
module.exports = { argsOf, projectOf, json, checked, panelBoundary, platformFeedbackBoundary, validate, run };
