#!/usr/bin/env node
'use strict';

/*
 * Turns observed foreshadowing progress into a compact, chapter-facing agenda.
 * The source plan stays editable; this is a rebuildable pressure map that
 * makes stale promises visible before an unattended writer opens more debt.
 */
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const SOURCE = 'state/foreshadowing-progress.json';
const OUTPUT = 'state/hook-agenda.json';
const DEFAULTS = {
  stale_after_chapters: 10,
  resolve_after_chapters: 3,
  resolve_recent_window: 2,
  payoff_lookahead_chapters: 3,
  max_active_hooks: 8,
  max_must_advance: 2,
  max_stale_debt: 2,
};

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
function invalid(message, details) { throw new CliError('HOOK_AGENDA_INVALID', message, details); }
function bounded(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { invalid('Hook agenda source JSON parse failed', { file: normal(file), message: error.message }); }
}

function configOf(options = {}) {
  return {
    stale_after_chapters: bounded(options['stale-after'] ?? options.stale_after_chapters, DEFAULTS.stale_after_chapters, 2, 100),
    resolve_after_chapters: bounded(options['resolve-after'] ?? options.resolve_after_chapters, DEFAULTS.resolve_after_chapters, 1, 100),
    resolve_recent_window: bounded(options['resolve-recent'] ?? options.resolve_recent_window, DEFAULTS.resolve_recent_window, 0, 50),
    payoff_lookahead_chapters: bounded(options['payoff-lookahead'] ?? options.payoff_lookahead_chapters, DEFAULTS.payoff_lookahead_chapters, 0, 50),
    max_active_hooks: bounded(options['max-active'] ?? options.max_active_hooks, DEFAULTS.max_active_hooks, 1, 100),
    max_must_advance: bounded(options['max-must-advance'] ?? options.max_must_advance, DEFAULTS.max_must_advance, 1, 10),
    max_stale_debt: bounded(options['max-stale-debt'] ?? options.max_stale_debt, DEFAULTS.max_stale_debt, 1, 10),
  };
}

function observedChapters(entry, field) {
  const values = Array.isArray(entry?.observed?.[field]) ? entry.observed[field] : [];
  return values.map((item) => Number(item?.chapter)).filter((chapter) => Number.isInteger(chapter) && chapter > 0).sort((a, b) => a - b);
}

function healthOf(entry, through, config) {
  const opened = observedChapters(entry, 'opened');
  const closed = observedChapters(entry, 'closed');
  const setup = Number(entry?.plan?.setup_chapter || 0);
  const deadline = Number(entry?.plan?.payoff_deadline_chapter || 0);
  const start = opened[0] || (setup > 0 ? setup : 0);
  const lastAdvanced = opened.at(-1) || start;
  const resolved = closed.some((chapter) => chapter >= start) || entry?.status === 'resolved';
  const active = !resolved && opened.length > 0;
  const age = active && lastAdvanced > 0 ? Math.max(0, through - lastAdvanced) : null;
  const stale = active && age >= config.stale_after_chapters;
  const payoffSoon = active && deadline >= through && deadline - through <= config.payoff_lookahead_chapters;
  const eligibleResolve = active && through - start >= config.resolve_after_chapters && lastAdvanced >= through - config.resolve_recent_window;
  return {
    id: String(entry?.id || '').trim(),
    content: String(entry?.plan?.content || '').trim(),
    status: resolved ? 'resolved' : active ? 'active' : String(entry?.status || 'planned'),
    start_chapter: start || null,
    last_advanced_chapter: lastAdvanced || null,
    payoff_deadline_chapter: deadline || null,
    age_since_advance: age,
    stale,
    payoff_soon: payoffSoon,
    eligible_resolve: eligibleResolve,
    opened_chapters: opened,
    closed_chapters: closed,
  };
}

function agendaOf(entries, through, config) {
  const active = entries.filter((entry) => entry.status === 'active');
  const pressure = active.filter((entry) => entry.stale || entry.payoff_soon || entry.eligible_resolve)
    .sort((left, right) => {
      const leftRank = (left.stale ? 0 : left.payoff_soon ? 1 : 2);
      const rightRank = (right.stale ? 0 : right.payoff_soon ? 1 : 2);
      return leftRank - rightRank || Number(right.age_since_advance || 0) - Number(left.age_since_advance || 0) || left.id.localeCompare(right.id);
    });
  const mustAdvance = pressure.slice(0, config.max_must_advance);
  const staleDebt = active.filter((entry) => entry.stale).sort((left, right) => Number(right.age_since_advance || 0) - Number(left.age_since_advance || 0) || left.id.localeCompare(right.id)).slice(0, config.max_stale_debt);
  const eligibleResolve = active.filter((entry) => entry.eligible_resolve).sort((left, right) => Number(left.start_chapter || 0) - Number(right.start_chapter || 0) || left.id.localeCompare(right.id)).slice(0, 1);
  const warnings = [];
  const recommendations = [];
  if (active.length > config.max_active_hooks) {
    warnings.push({ code: 'ACTIVE_HOOK_CAP_EXCEEDED', active_count: active.length, max_active_hooks: config.max_active_hooks, ids: active.map((entry) => entry.id) });
    recommendations.push('Advance, resolve, or explicitly defer existing promises before opening more hooks.');
  }
  if (staleDebt.length) {
    warnings.push({ code: 'STALE_HOOK_DEBT', ids: staleDebt.map((entry) => entry.id), stale_after_chapters: config.stale_after_chapters });
    recommendations.push('Give one stale hook a visible escalation, new evidence, consequence, or payoff before opening sibling mysteries.');
  }
  if (mustAdvance.length) recommendations.push(`This chapter must visibly move: ${mustAdvance.map((entry) => entry.id).join(', ')}.`);
  return { active, must_advance: mustAdvance, stale_debt: staleDebt, eligible_resolve: eligibleResolve, warnings, recommendations };
}

function build(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const state = readJson(path.join(project, 'state', 'project-state.json'));
  const through = bounded(options.chapter, Number(state.updated_through || 0) + 1, 1, 1000000);
  const config = configOf(options);
  const source = path.join(project, SOURCE);
  const progress = fs.existsSync(source) ? readJson(source) : { entries: [], updated_through: 0 };
  if (!Array.isArray(progress.entries)) invalid('Foreshadowing progress must contain entries', { source: SOURCE });
  const entries = progress.entries.map((entry) => healthOf(entry, through, config)).filter((entry) => entry.id);
  const agenda = agendaOf(entries, through, config);
  return {
    schema_version: '1.0', generated_at: new Date().toISOString(), target_chapter: through,
    source: SOURCE, source_updated_through: Number(progress.updated_through || 0), policy: config,
    active_hooks: agenda.active, must_advance: agenda.must_advance, stale_debt: agenda.stale_debt, eligible_resolve: agenda.eligible_resolve,
    warnings: agenda.warnings, recommendations: agenda.recommendations,
    audit: { active: agenda.active.length, must_advance: agenda.must_advance.length, stale_debt: agenda.stale_debt.length, eligible_resolve: agenda.eligible_resolve.length },
  };
}

function write(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const data = build(project, options);
  atomicWrite(path.join(project, OUTPUT), `${JSON.stringify(data, null, 2)}\n`);
  return { ok: true, project, output: OUTPUT, target_chapter: data.target_chapter, audit: data.audit, warnings: data.warnings, recommendations: data.recommendations, data };
}

function read(projectInput) {
  const project = projectOf(projectInput);
  const file = path.join(project, OUTPUT);
  if (!fs.existsSync(file)) return { schema_version: '1.0', target_chapter: null, active_hooks: [], must_advance: [], stale_debt: [], eligible_resolve: [], warnings: [], recommendations: [], audit: { active: 0, must_advance: 0, stale_debt: 0, eligible_resolve: 0 } };
  const data = readJson(file);
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.must_advance)) invalid('Hook agenda must contain must_advance array', { file: OUTPUT });
  return data;
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (args.command !== 'update' || !args.project) throw new CliError('USAGE', 'Usage: node hook-agenda.js update <PROJECT> [--chapter N] [--stale-after 10]');
  const report = write(args.project, args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'hook-agenda'); }
}

module.exports = { SOURCE, OUTPUT, DEFAULTS, argsOf, bounded, projectOf, configOf, observedChapters, healthOf, agendaOf, build, write, read, run };
