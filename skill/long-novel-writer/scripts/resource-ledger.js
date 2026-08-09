#!/usr/bin/env node
'use strict';

/*
 * Builds a compact, evidence-bound resource ledger from accepted chapter facts.
 * It keeps resource continuity distinct from proposals or outline intentions:
 * only literal, accepted resource deltas are available to future drafts.
 */
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');
const { FACT_LEDGER_DIR } = require('./chapter-facts');

const OUTPUT = 'state/resource-ledger.json';
const WINDOW_OUTPUT = 'state/resource-window.json';
const DEFAULTS = { stale_after_chapters: 12, max_window_resources: 8 };
const ACTIVE_STATUSES = new Set(['available', 'hidden']);

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
function keyOf(value) { return String(value || '').trim().toLocaleLowerCase('en-US'); }
function bounded(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}
function invalid(message, details) { throw new CliError('RESOURCE_LEDGER_INVALID', message, details); }

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { invalid(`${label} JSON parse failed`, { file: normal(file), message: error.message }); }
}

function configOf(options = {}) {
  return {
    stale_after_chapters: bounded(options['stale-after'] ?? options.stale_after_chapters, DEFAULTS.stale_after_chapters, 2, 100),
    max_window_resources: bounded(options['max-window'] ?? options.max_window_resources, DEFAULTS.max_window_resources, 1, 40),
  };
}

function factLedgers(project, through) {
  const directory = path.join(project, FACT_LEDGER_DIR);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => /^ch-\d{4}\.json$/i.test(name))
    .sort()
    .map((name) => {
      const file = path.join(directory, name);
      const data = readJson(file, 'Chapter fact ledger');
      const chapter = Number(data.chapter);
      if (!Number.isInteger(chapter) || chapter <= 0 || !Array.isArray(data.facts)) invalid('Fact ledger must have a positive chapter and facts array', { file: normal(path.relative(project, file)) });
      return { chapter, file: normal(path.relative(project, file)), facts: data.facts };
    })
    .filter((ledger) => ledger.chapter <= through)
    .sort((left, right) => left.chapter - right.chapter || left.file.localeCompare(right.file));
}

function resourceEvents(ledgers) {
  const unstructured = [];
  const events = [];
  for (const ledger of ledgers) {
    ledger.facts.forEach((fact, index) => {
      if (String(fact?.kind || '') !== 'resource') return;
      if (!fact.resource || typeof fact.resource !== 'object' || Array.isArray(fact.resource)) {
        unstructured.push({ code: 'RESOURCE_FACT_UNSTRUCTURED', chapter: ledger.chapter, file: ledger.file, index, subject: String(fact?.subject || '').trim() });
        return;
      }
      const holder = String(fact.resource.holder || '').trim();
      const key = String(fact.resource.key || '').trim();
      const type = String(fact.resource.type || '').trim();
      const action = String(fact.resource.action || '').trim();
      const statusAfter = String(fact.resource.status_after || '').trim();
      if (!holder || !key || !type || !action || !statusAfter) {
        unstructured.push({ code: 'RESOURCE_FACT_FIELDS_MISSING', chapter: ledger.chapter, file: ledger.file, index, subject: String(fact?.subject || '').trim() });
        return;
      }
      events.push({
        chapter: ledger.chapter, index, file: ledger.file, holder, key, type, action, status_after: statusAfter,
        risk: String(fact.resource.risk || 'normal').trim() || 'normal',
        expected_use_by_chapter: Number.isInteger(Number(fact.resource.expected_use_by_chapter)) && Number(fact.resource.expected_use_by_chapter) > 0 ? Number(fact.resource.expected_use_by_chapter) : null,
        subject: String(fact.subject || '').trim(), claim: String(fact.claim || '').trim(), evidence: String(fact.evidence || '').trim(),
      });
    });
  }
  return { events: events.sort((left, right) => left.chapter - right.chapter || left.index - right.index), unstructured };
}

function resourceId(holder, key) { return `${keyOf(holder)}\u0000${keyOf(key)}`; }

function applyEvents(events, through, config) {
  const resources = new Map();
  const warnings = [];
  for (const event of events) {
    const id = resourceId(event.holder, event.key);
    const prior = resources.get(id);
    if (['consumed', 'lost', 'damaged'].includes(event.action) && (!prior || !ACTIVE_STATUSES.has(prior.status))) {
      warnings.push({ code: 'RESOURCE_STATUS_CONFLICT', id, chapter: event.chapter, holder: event.holder, key: event.key, action: event.action, prior_status: prior?.status || null, evidence: event.evidence });
    }
    resources.set(id, {
      id, holder: event.holder, key: event.key, type: event.type, risk: event.risk,
      status: event.status_after, expected_use_by_chapter: event.expected_use_by_chapter,
      introduced_chapter: prior?.introduced_chapter || event.chapter,
      last_changed_chapter: event.chapter,
      last_action: event.action,
      source: { chapter: event.chapter, file: event.file, subject: event.subject, claim: event.claim, evidence: event.evidence },
      history_count: Number(prior?.history_count || 0) + 1,
    });
  }
  const all = [...resources.values()].sort((left, right) => left.holder.localeCompare(right.holder) || left.key.localeCompare(right.key));
  const active = all.map((resource) => ({
    ...resource,
    stale: ACTIVE_STATUSES.has(resource.status) && through - resource.last_changed_chapter >= config.stale_after_chapters,
    due: Number.isInteger(resource.expected_use_by_chapter) && resource.expected_use_by_chapter <= through,
  }));
  const stale = active.filter((resource) => resource.stale);
  const due = active.filter((resource) => resource.due);
  if (stale.length) warnings.push({ code: 'RESOURCE_STALE', ids: stale.map((resource) => resource.id), stale_after_chapters: config.stale_after_chapters });
  if (due.length) warnings.push({ code: 'RESOURCE_EXPECTED_USE_DUE', ids: due.map((resource) => resource.id) });
  return { all: active, active: active.filter((resource) => ACTIVE_STATUSES.has(resource.status)), stale, due, warnings };
}

function cellsOf(line) { return String(line || '').trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()); }
function participantsOf(project, chapter) {
  const file = path.join(project, 'outline', 'chapter-beats.md');
  if (!fs.existsSync(file)) return [];
  const row = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|'))
    .map(cellsOf)
    .find((cells) => Number.parseInt(cells[0], 10) === chapter);
  if (!row) return [];
  return [...new Set(row.slice(1).map((value) => String(value || '').trim()).filter(Boolean))];
}

function windowOf(resources, participants, config) {
  const participantText = participants.join('\n').toLocaleLowerCase('en-US');
  const candidate = resources.filter((resource) => resource.due || resource.stale || resource.risk === 'high' || (resource.holder !== 'shared' && participantText.includes(resource.holder.toLocaleLowerCase('en-US'))));
  const selected = candidate
    .sort((left, right) => Number(right.due) - Number(left.due) || Number(right.stale) - Number(left.stale) || Number(right.risk === 'high') - Number(left.risk === 'high') || right.last_changed_chapter - left.last_changed_chapter || left.id.localeCompare(right.id))
    .slice(0, config.max_window_resources);
  return { participants, resources: selected, omitted_count: Math.max(0, candidate.length - selected.length) };
}

function build(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const state = readJson(path.join(project, 'state', 'project-state.json'), 'Project state');
  const chapter = bounded(options.chapter, Number(state.updated_through || 0) + 1, 1, 1000000);
  const config = configOf(options);
  const ledgers = factLedgers(project, chapter);
  const extracted = resourceEvents(ledgers);
  const applied = applyEvents(extracted.events, chapter, config);
  const participants = participantsOf(project, chapter);
  const window = windowOf(applied.active, participants, config);
  const warnings = [...extracted.unstructured, ...applied.warnings];
  const ledger = {
    schema_version: '1.0', generated_at: new Date().toISOString(), target_chapter: chapter,
    source: FACT_LEDGER_DIR, policy: config, resources: applied.all,
    stale_resources: applied.stale.map((item) => item.id), due_resources: applied.due.map((item) => item.id), warnings,
    audit: { fact_ledgers: ledgers.length, resource_events: extracted.events.length, active_resources: applied.active.length, stale_resources: applied.stale.length, due_resources: applied.due.length, unstructured_resource_facts: extracted.unstructured.length },
  };
  const windowData = {
    schema_version: '1.0', generated_at: ledger.generated_at, target_chapter: chapter, source: OUTPUT,
    participants: window.participants, resources: window.resources, omitted_count: window.omitted_count,
    warnings: warnings.filter((warning) => ['RESOURCE_STATUS_CONFLICT', 'RESOURCE_STALE', 'RESOURCE_EXPECTED_USE_DUE'].includes(warning.code)),
    rule: 'Use only listed resource facts as established. Do not invent ownership, availability, consumption, or access; record literal new deltas after acceptance.',
  };
  return { project, chapter, ledger, window: windowData, warnings };
}

function write(projectInput, options = {}) {
  const result = build(projectInput, options);
  atomicWrite(path.join(result.project, OUTPUT), `${JSON.stringify(result.ledger, null, 2)}\n`);
  atomicWrite(path.join(result.project, WINDOW_OUTPUT), `${JSON.stringify(result.window, null, 2)}\n`);
  return { ok: true, project: result.project, chapter: result.chapter, output: OUTPUT, window_output: WINDOW_OUTPUT, audit: result.ledger.audit, warnings: result.warnings, data: result.ledger, window: result.window };
}

function read(projectInput) {
  const project = projectOf(projectInput);
  const file = path.join(project, OUTPUT);
  if (!fs.existsSync(file)) return { schema_version: '1.0', target_chapter: null, resources: [], stale_resources: [], due_resources: [], warnings: [], audit: { active_resources: 0 } };
  const data = readJson(file, 'Resource ledger');
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.resources)) invalid('Resource ledger must contain resources array', { file: OUTPUT });
  return data;
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (args.command !== 'update' || !args.project) throw new CliError('USAGE', 'Usage: node resource-ledger.js update <PROJECT> [--chapter N] [--stale-after 12]');
  const result = write(args.project, args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'resource-ledger'); }
}

module.exports = { OUTPUT, WINDOW_OUTPUT, DEFAULTS, ACTIVE_STATUSES, argsOf, projectOf, configOf, factLedgers, resourceEvents, applyEvents, participantsOf, windowOf, build, write, read, run };
