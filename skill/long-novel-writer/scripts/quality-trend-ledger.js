#!/usr/bin/env node
'use strict';

/*
 * Converts accepted, manuscript-bound cold-reader reports into a compact
 * next-chapter quality brief.  This is deliberately derived from the final
 * accepted chapter artifact instead of the writing model's self-assessment.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');
const pacingLedger = require('./pacing-ledger');

const LEDGER_FILE = 'state/quality-trend-ledger.json';
const GUIDANCE_FILE = 'state/quality-guidance.json';
const DIMENSIONS = ['clarity', 'continuation', 'fanqie_fit', 'character_agency', 'payoff'];
const RECENT_WINDOW = 5;
const DROP_THRESHOLD = 0.75;
const LOW_SCORE = 7;

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) {
      const next = argv[index + 1];
      args[value.slice(2)] = next !== undefined && !next.startsWith('--') ? next : true;
      if (args[value.slice(2)] !== true) index++;
    } else if (!args.command) args.command = value;
    else if (!args.project) args.project = value;
  }
  return args;
}

function normal(value) { return String(value || '').replace(/\\/g, '/'); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function chapterId(chapter) { return String(Number(chapter)).padStart(4, '0'); }
function average(values) { return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null; }

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function ledgerFile(project) { return path.join(project, LEDGER_FILE); }
function guidanceFile(project) { return path.join(project, GUIDANCE_FILE); }
function emptyLedger() { return { schema_version: '1.0', updated_at: null, updated_through: 0, entries: [], audit: { warnings: [], weakest_dimension: null, recent_average: null, previous_average: null, trend: 'insufficient_data' } }; }
function emptyGuidance(targetChapter = null) { return { schema_version: '1.0', generated_at: null, target_chapter: targetChapter, source: LEDGER_FILE, window: [], weakest_dimension: null, weakest_chapter: null, trend: 'insufficient_data', warnings: [], recommendations: ['No accepted cold-reader history is available yet. Follow the binding chapter card and reader contract.'], rule: 'This is an evidence-derived diagnostic brief. It cannot override the chapter card, canon, reader contract, or platform contract.' }; }

function scoreMap(value) {
  const scores = {};
  for (const dimension of DIMENSIONS) {
    const score = Number(value?.scores?.[dimension]);
    if (!Number.isFinite(score) || score < 0 || score > 10) return null;
    scores[dimension] = score;
  }
  return scores;
}

function entryOf(project, chapter) {
  let manuscript;
  try { manuscript = pacingLedger.manuscriptOf(project, chapter); } catch (_) { return null; }
  const report = pacingLedger.reportOf(project, chapter, manuscript);
  if (!report) return null;
  const scores = scoreMap(report.value);
  if (!scores) return null;
  return {
    chapter,
    manuscript: manuscript.relative,
    manuscript_sha256: manuscript.sha256,
    review: report.relative,
    review_sha256: sha256(fs.readFileSync(report.file)),
    review_round: report.round,
    scores,
    mean_score: average(Object.values(scores)),
  };
}

function entriesOf(project, targetChapter) {
  const entries = [];
  for (let chapter = 1; chapter < targetChapter; chapter++) {
    const entry = entryOf(project, chapter);
    if (entry) entries.push(entry);
  }
  return entries;
}

function focusFor(dimension) {
  return {
    clarity: 'Make every scene legible in cause-and-effect order: what changes, why the POV responds, and what the response costs.',
    continuation: 'Give the reader a concrete changed situation and a specific next question; do not end on generic danger or delayed explanation.',
    fanqie_fit: 'Use mobile-first scene prose: enter action early, keep paragraphs short, let dialogue or action change the situation, and avoid essay-like explanation.',
    character_agency: 'Put the POV under pressure and require a visible choice with consequence; do not let coincidence or other characters solve the assigned beat.',
    payoff: 'Land one visible result, answer, gain/loss, relationship shift, or actionable new fact before the end; a promise of later payoff is not a payoff.',
  }[dimension] || 'Follow the binding chapter card and make the chapter deliver a visible reader-facing change.';
}

function weakestDimension(entries) {
  if (!entries.length) return null;
  const window = entries.slice(-RECENT_WINDOW);
  return [...DIMENSIONS].map((dimension) => ({
    dimension,
    average: average(window.map((entry) => entry.scores[dimension])),
    latest: window.at(-1).scores[dimension],
  })).sort((left, right) => left.average - right.average || left.latest - right.latest || left.dimension.localeCompare(right.dimension))[0];
}

function audit(entries) {
  const ordered = [...entries].sort((left, right) => left.chapter - right.chapter);
  const recent = ordered.slice(-RECENT_WINDOW);
  const trendWindow = ordered.slice(-3);
  const latest = recent.at(-1) || null;
  const warnings = [];
  const weakest = weakestDimension(ordered);
  const recentAverage = average(trendWindow.map((entry) => entry.mean_score));
  const previous = ordered.length >= 6 ? ordered.slice(-6, -3) : [];
  const previousAverage = average(previous.map((entry) => entry.mean_score));
  const delta = recentAverage !== null && previousAverage !== null ? Number((recentAverage - previousAverage).toFixed(2)) : null;
  let trend = 'insufficient_data';
  if (delta !== null) trend = delta <= -DROP_THRESHOLD ? 'declining' : delta >= DROP_THRESHOLD ? 'improving' : 'stable';
  if (delta !== null && delta <= -DROP_THRESHOLD) warnings.push({ code: 'QUALITY_SCORE_DROP', current_window: trendWindow.map((entry) => entry.chapter), comparison_window: previous.map((entry) => entry.chapter), delta, threshold: DROP_THRESHOLD });
  if (latest && latest.mean_score <= LOW_SCORE) warnings.push({ code: 'QUALITY_WEAK_CHAPTER', chapter: latest.chapter, mean_score: latest.mean_score, threshold: LOW_SCORE });
  if (weakest) {
    const streak = ordered.slice(-3).filter((entry) => entry.scores[weakest.dimension] <= LOW_SCORE);
    if (streak.length === 3) warnings.push({ code: 'QUALITY_DIMENSION_STREAK', dimension: weakest.dimension, chapters: streak.map((entry) => entry.chapter), threshold: LOW_SCORE });
  }
  return { warnings, weakest_dimension: weakest, recent_average: recentAverage, previous_average: previousAverage, delta, trend };
}

function guidanceOf(targetChapter, entries, report) {
  const guidance = emptyGuidance(targetChapter);
  const weakestChapter = entries.length ? [...entries].sort((left, right) => left.mean_score - right.mean_score || right.chapter - left.chapter)[0] : null;
  const weakest = report.weakest_dimension;
  return {
    ...guidance,
    generated_at: new Date().toISOString(),
    window: entries.slice(-RECENT_WINDOW).map((entry) => ({ chapter: entry.chapter, mean_score: entry.mean_score, scores: entry.scores, review: entry.review })),
    weakest_dimension: weakest ? { ...weakest, focus: focusFor(weakest.dimension) } : null,
    weakest_chapter: weakestChapter ? { chapter: weakestChapter.chapter, mean_score: weakestChapter.mean_score, review: weakestChapter.review } : null,
    trend: report.trend,
    recent_average: report.recent_average,
    previous_average: report.previous_average,
    delta: report.delta,
    warnings: report.warnings,
    recommendations: weakest ? [focusFor(weakest.dimension), ...(report.trend === 'declining' ? ['The recent accepted-reader trend declined. Repair this one dimension through the assigned scene rather than adding unrelated plot complexity.'] : []), 'Preserve the binding chapter card and canon; this brief is diagnostic, not permission to change planned story facts.'] : guidance.recommendations,
  };
}

function build(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const state = JSON.parse(fs.readFileSync(path.join(project, 'state', 'project-state.json'), 'utf8').replace(/^\uFEFF/, ''));
  const targetChapter = Number.parseInt(options.chapter || String(Number(state.updated_through || 0) + 1), 10);
  if (!Number.isInteger(targetChapter) || targetChapter <= 0) throw new CliError('INVALID_CHAPTER', 'chapter must be a positive integer', { chapter: options.chapter });
  const entries = entriesOf(project, targetChapter);
  const report = audit(entries);
  const ledger = { schema_version: '1.0', updated_at: new Date().toISOString(), updated_through: entries.at(-1)?.chapter || 0, entries, audit: report };
  const guidance = guidanceOf(targetChapter, entries, report);
  return { project, targetChapter, ledger, guidance };
}

function write(projectInput, options = {}) {
  const result = build(projectInput, options);
  atomicWrite(ledgerFile(result.project), `${JSON.stringify(result.ledger, null, 2)}\n`);
  atomicWrite(guidanceFile(result.project), `${JSON.stringify(result.guidance, null, 2)}\n`);
  return { ...result, output: LEDGER_FILE, guidance_output: GUIDANCE_FILE };
}

function inspect(projectInput) {
  const project = projectOf(projectInput);
  const data = fs.existsSync(ledgerFile(project)) ? JSON.parse(fs.readFileSync(ledgerFile(project), 'utf8').replace(/^\uFEFF/, '')) : emptyLedger();
  return { ok: true, project, file: LEDGER_FILE, guidance_file: GUIDANCE_FILE, updated_through: Number(data.updated_through || 0), entries: Array.isArray(data.entries) ? data.entries.length : 0, audit: data.audit || emptyLedger().audit };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.command || !args.project || !['update', 'audit'].includes(args.command)) throw new CliError('USAGE', 'Usage: node quality-trend-ledger.js update|audit <PROJECT> [--chapter N]');
  const report = args.command === 'update' ? write(args.project, args) : inspect(args.project);
  const output = args.command === 'update' ? { ok: true, project: report.project, target_chapter: report.targetChapter, output: report.output, guidance_output: report.guidance_output, entries: report.ledger.entries.length, audit: report.ledger.audit } : report;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'quality-trend-ledger'); }
}

module.exports = { LEDGER_FILE, GUIDANCE_FILE, DIMENSIONS, RECENT_WINDOW, DROP_THRESHOLD, LOW_SCORE, argsOf, normal, sha256, chapterId, average, projectOf, ledgerFile, guidanceFile, emptyLedger, emptyGuidance, scoreMap, entryOf, entriesOf, focusFor, weakestDimension, audit, guidanceOf, build, write, inspect, run };
