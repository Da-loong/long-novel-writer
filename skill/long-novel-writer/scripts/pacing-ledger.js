#!/usr/bin/env node
'use strict';

/*
 * Persists a compact, reader-labelled pacing history after a chapter commits.
 * It is deliberately advisory: a serial novel needs variation, not a fixed
 * rhythm formula. The next chapter receives the factual history and warnings.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const LEDGER_FILE = 'state/pacing-ledger.json';
const PRESSURES = new Set(['setup', 'rising', 'high', 'release']);
const HOOK_TYPES = new Set(['risk', 'reveal', 'choice', 'deadline', 'reversal', 'relationship', 'resource', 'mystery']);
const PAYOFF_TYPES = new Set(['answer', 'win', 'loss', 'resource', 'relationship', 'information', 'survival', 'progress']);

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
function invalid(message, details) { throw new CliError('PACING_LEDGER_INVALID', message, details); }

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function manuscriptOf(project, chapter) {
  const directory = path.join(project, 'manuscript');
  const pattern = new RegExp(`^ch-${chapterId(chapter)}-.+\\.md$`, 'i');
  const names = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => pattern.test(name)).sort() : [];
  if (names.length !== 1) throw new CliError('CHAPTER_ARTIFACT_SHAPE', `Expected exactly one manuscript for chapter ${chapter}`, { chapter: Number(chapter), files: names });
  const file = path.join(directory, names[0]);
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return { file, relative: normal(path.relative(project, file)), sha256: sha256(text) };
}

function ledgerFile(project) { return path.join(project, LEDGER_FILE); }
function emptyLedger() { return { schema_version: '1.0', updated_at: null, updated_through: 0, entries: [], audit: { warnings: [], recommendations: [] } }; }

function readLedger(project) {
  const file = ledgerFile(project);
  if (!fs.existsSync(file)) return emptyLedger();
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { invalid('Pacing ledger JSON parse failed', { file: normal(path.relative(project, file)), message: error.message }); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.entries)) invalid('Pacing ledger must contain an entries array', { file: normal(path.relative(project, file)) });
  return { ...emptyLedger(), ...data, entries: data.entries };
}

function rhythmOf(value, chapter, file) {
  const rhythm = value?.rhythm;
  if (!rhythm || typeof rhythm !== 'object' || Array.isArray(rhythm)) invalid('Reader review rhythm object is required for pacing history', { chapter, file });
  const pressure = String(rhythm.pressure || '').trim();
  const hookType = String(rhythm.hook_type || '').trim();
  const payoffType = String(rhythm.payoff_type || '').trim();
  if (!PRESSURES.has(pressure) || !HOOK_TYPES.has(hookType) || !PAYOFF_TYPES.has(payoffType)) invalid('Reader review rhythm labels are invalid', { chapter, file, pressure, hook_type: hookType, payoff_type: payoffType });
  return { pressure, hook_type: hookType, payoff_type: payoffType };
}

function reportOf(project, chapter, manuscript) {
  const directory = path.join(project, 'analysis');
  const pattern = new RegExp(`^chapter-reader-review-ch${chapterId(chapter)}-r(\\d{2})\\.json$`, 'i');
  const candidates = fs.existsSync(directory) ? fs.readdirSync(directory).map((name) => {
    const match = name.match(pattern);
    if (!match) return null;
    const file = path.join(directory, name);
    try { return { file, relative: normal(path.relative(project, file)), round: Number(match[1]), value: JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) }; }
    catch (error) { invalid('Reader review JSON parse failed', { chapter, file: normal(path.relative(project, file)), message: error.message }); }
  }).filter(Boolean) : [];
  const accepted = candidates.filter((candidate) => candidate.value?.verdict === 'pass' && candidate.value?.should_revise === false && candidate.value?.manuscript_sha256 === manuscript.sha256).sort((left, right) => right.round - left.round);
  return accepted[0] || null;
}

function trailingSame(entries, field) {
  if (!entries.length) return { value: null, length: 0 };
  const value = entries.at(-1).rhythm?.[field] || null;
  let length = 0;
  for (let index = entries.length - 1; index >= 0 && entries[index].rhythm?.[field] === value; index--) length++;
  return { value, length };
}

function audit(entries) {
  const ordered = [...entries].sort((left, right) => Number(left.chapter) - Number(right.chapter));
  const warnings = [];
  const recommendations = [];
  const hook = trailingSame(ordered, 'hook_type');
  const payoff = trailingSame(ordered, 'payoff_type');
  const pressure = trailingSame(ordered, 'pressure');
  const recent = ordered.slice(-5);
  if (hook.length >= 3) {
    warnings.push({ code: 'HOOK_TYPE_STREAK', chapters: recent.slice(-hook.length).map((item) => item.chapter), hook_type: hook.value, length: hook.length });
    recommendations.push(`Change the next chapter's primary hook away from ${hook.value}; retain causality but vary the reader question.`);
  }
  if (payoff.length >= 3) {
    warnings.push({ code: 'PAYOFF_TYPE_STREAK', chapters: recent.slice(-payoff.length).map((item) => item.chapter), payoff_type: payoff.value, length: payoff.length });
    recommendations.push(`Vary the next visible payoff away from ${payoff.value}; do not repeat the same reward shape.`);
  }
  if (pressure.value === 'high' && pressure.length >= 4) {
    warnings.push({ code: 'PRESSURE_OVERLOAD', chapters: recent.slice(-pressure.length).map((item) => item.chapter), length: pressure.length });
    recommendations.push('After sustained high pressure, deliver a brief resolution, relational beat, or earned release before escalating again.');
  }
  if (recent.length === 5 && !recent.some((item) => item.rhythm?.pressure === 'release') && recent.filter((item) => item.rhythm?.pressure === 'high').length >= 3) {
    warnings.push({ code: 'RELEASE_GAP', chapters: recent.map((item) => item.chapter) });
    recommendations.push('The recent run lacks a release beat; let a concrete payoff land rather than stacking cliffhangers only.');
  }
  return {
    window: recent.map((item) => ({ chapter: item.chapter, ...item.rhythm, continuation: item.scores?.continuation, payoff_score: item.scores?.payoff })),
    warnings, recommendations,
  };
}

function update(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const chapter = Number.parseInt(options.chapter, 10);
  if (!Number.isInteger(chapter) || chapter <= 0) throw new CliError('INVALID_CHAPTER', 'chapter must be a positive integer', { chapter: options.chapter });
  const manuscript = manuscriptOf(project, chapter);
  const report = reportOf(project, chapter, manuscript);
  if (!report) return { ok: true, skipped: true, project, chapter, reason: 'no accepted matching cold-reader report' };
  const rhythm = rhythmOf(report.value, chapter, report.relative);
  const ledger = readLedger(project);
  const entry = {
    chapter, manuscript: manuscript.relative, manuscript_sha256: manuscript.sha256,
    review: report.relative, review_sha256: sha256(fs.readFileSync(report.file)), rhythm,
    scores: {
      continuation: Number(report.value.scores?.continuation), payoff: Number(report.value.scores?.payoff), fanqie_fit: Number(report.value.scores?.fanqie_fit),
    }, committed_at: new Date().toISOString(),
  };
  const entries = [...ledger.entries.filter((item) => Number(item.chapter) !== chapter), entry].sort((left, right) => Number(left.chapter) - Number(right.chapter));
  const next = { schema_version: '1.0', updated_at: new Date().toISOString(), updated_through: entries.at(-1)?.chapter || 0, entries, audit: audit(entries) };
  atomicWrite(ledgerFile(project), `${JSON.stringify(next, null, 2)}\n`);
  return { ok: true, project, chapter, output: LEDGER_FILE, entry, audit: next.audit };
}

function inspect(projectInput) {
  const project = projectOf(projectInput);
  const ledger = readLedger(project);
  return { ok: true, project, file: LEDGER_FILE, updated_through: Number(ledger.updated_through || 0), entries: ledger.entries.length, audit: audit(ledger.entries) };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.command || !args.project || !['update', 'audit'].includes(args.command)) throw new CliError('USAGE', 'Usage: node pacing-ledger.js update|audit <PROJECT> [--chapter N]');
  if (args.command === 'update' && !args.chapter) throw new CliError('USAGE', 'Usage: node pacing-ledger.js update <PROJECT> --chapter N');
  const report = args.command === 'update' ? update(args.project, args) : inspect(args.project);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'pacing-ledger'); }
}

module.exports = { LEDGER_FILE, PRESSURES, HOOK_TYPES, PAYOFF_TYPES, argsOf, chapterId, sha256, projectOf, manuscriptOf, ledgerFile, emptyLedger, readLedger, rhythmOf, reportOf, trailingSame, audit, update, inspect, run };
