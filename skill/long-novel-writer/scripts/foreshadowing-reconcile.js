#!/usr/bin/env node
'use strict';

/*
 * Reconciles planned foreshadowing against literal evidence extracted from
 * accepted chapters. The outline remains a plan; this file is a rebuildable
 * observation layer and never edits the plan's status column.
 */
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');
const foreshadowing = require('./foreshadowing-index');
const { FACT_LEDGER_DIR } = require('./chapter-facts');

const OUTPUT = 'state/foreshadowing-progress.json';

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
function chapterId(chapter) { return String(Number(chapter)).padStart(4, '0'); }
function idOf(value) { return String(value || '').trim().toLocaleLowerCase('en-US'); }
function invalid(message, details) { throw new CliError('FORESHADOW_PROGRESS_INVALID', message, details); }

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

function factLedgers(project, through) {
  const directory = path.join(project, FACT_LEDGER_DIR);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => /^ch-\d{4}\.json$/i.test(name))
    .sort()
    .map((name) => {
      const file = path.join(directory, name);
      const value = readJson(file, 'Chapter fact ledger');
      const chapter = Number(value.chapter);
      if (!Number.isInteger(chapter) || chapter <= 0 || chapterId(chapter) !== name.slice(3, 7)) invalid('Fact ledger chapter does not match its file name', { file: normal(path.relative(project, file)), chapter: value.chapter });
      if (!Array.isArray(value.facts)) invalid('Fact ledger facts must be an array', { file: normal(path.relative(project, file)) });
      return { chapter, file: normal(path.relative(project, file)), facts: value.facts };
    })
    .filter((item) => item.chapter <= through);
}

function hookFacts(ledgers) {
  return ledgers.flatMap((ledger) => ledger.facts
    .filter((fact) => fact && ['hook_open', 'hook_closed'].includes(fact.kind))
    .map((fact) => ({
      chapter: ledger.chapter, file: ledger.file, kind: fact.kind,
      subject: String(fact.subject || '').trim(), claim: String(fact.claim || '').trim(), evidence: String(fact.evidence || '').trim(),
    })));
}

function evidenceOf(fact) {
  return { chapter: fact.chapter, file: fact.file, claim: fact.claim, evidence: fact.evidence };
}

function plannedEntry(node, facts, through) {
  const identifier = idOf(node.id);
  const matched = facts.filter((fact) => idOf(fact.subject) === identifier);
  const opens = matched.filter((fact) => fact.kind === 'hook_open').sort((left, right) => left.chapter - right.chapter);
  const closes = matched.filter((fact) => fact.kind === 'hook_closed').sort((left, right) => left.chapter - right.chapter);
  const setupEvidence = opens.filter((fact) => fact.chapter === node.setup_chapter).map(evidenceOf);
  const reinforcementEvidence = (node.reinforcement_chapters || []).map((chapter) => ({
    chapter,
    evidence: opens.filter((fact) => fact.chapter === chapter).map(evidenceOf),
  }));
  const closure = closes.find((fact) => fact.chapter >= node.setup_chapter) || null;
  const errors = [];
  const warnings = [];
  if (closes.some((fact) => fact.chapter < node.setup_chapter)) errors.push({ code: 'FORESHADOW_CLOSE_BEFORE_SETUP', id: node.id, setup_chapter: node.setup_chapter, closing_chapters: closes.filter((fact) => fact.chapter < node.setup_chapter).map((fact) => fact.chapter) });
  if (node.active && through >= node.payoff_deadline_chapter && !closure) errors.push({ code: 'FORESHADOW_PAYOFF_DUE_UNPROVEN', id: node.id, deadline: node.payoff_deadline_chapter, checked_through: through });
  if (node.active && through >= node.setup_chapter && setupEvidence.length === 0) warnings.push({ code: 'FORESHADOW_SETUP_UNOBSERVED', id: node.id, setup_chapter: node.setup_chapter });
  for (const item of reinforcementEvidence) {
    if (node.active && through >= item.chapter && item.evidence.length === 0) warnings.push({ code: 'FORESHADOW_REINFORCEMENT_UNOBSERVED', id: node.id, reinforcement_chapter: item.chapter });
  }
  if (!node.active && closes.length === 0) warnings.push({ code: 'FORESHADOW_PLANNED_CLOSE_UNPROVEN', id: node.id, plan_status: node.status });
  const status = closure ? 'resolved' : (node.active && through >= node.payoff_deadline_chapter ? 'overdue' : (opens.length ? 'active' : 'planned'));
  return {
    id: node.id,
    plan: { setup_chapter: node.setup_chapter, content: node.content, reinforcement_chapters: node.reinforcement_chapters, payoff_deadline_chapter: node.payoff_deadline_chapter, status: node.status },
    observed: {
      setup_evidence: setupEvidence,
      reinforcement_evidence: reinforcementEvidence,
      opened: opens.map(evidenceOf),
      closed: closes.map(evidenceOf),
    },
    status, errors, warnings,
  };
}

function build(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const through = Number.parseInt(options.chapter, 10);
  if (!Number.isInteger(through) || through <= 0) throw new CliError('INVALID_CHAPTER', 'chapter must be a positive integer', { chapter: options.chapter });
  const index = foreshadowing.build(project, { chapter: String(through) });
  const ledgers = factLedgers(project, through);
  const facts = hookFacts(ledgers);
  const entries = index.nodes.map((node) => plannedEntry(node, facts, through));
  const known = new Set(index.nodes.map((node) => idOf(node.id)));
  const unknown = facts.filter((fact) => !known.has(idOf(fact.subject))).map((fact) => ({ code: 'FORESHADOW_FACT_UNKNOWN_ID', subject: fact.subject, chapter: fact.chapter, file: fact.file }));
  const errors = [...index.errors, ...entries.flatMap((entry) => entry.errors)];
  const warnings = [...index.warnings, ...entries.flatMap((entry) => entry.warnings), ...unknown];
  return {
    schema_version: '1.0', generated_at: new Date().toISOString(), updated_through: through,
    plan: 'outline/foreshadowing-ledger.md', fact_ledgers: ledgers.map((ledger) => ledger.file), entries, errors, warnings,
    audit: {
      planned: entries.length,
      active: entries.filter((entry) => entry.status === 'active').length,
      resolved: entries.filter((entry) => entry.status === 'resolved').length,
      overdue: entries.filter((entry) => entry.status === 'overdue').length,
      unknown_hook_fact_count: unknown.length,
    },
  };
}

function write(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const report = build(project, options);
  atomicWrite(path.join(project, OUTPUT), `${JSON.stringify(report, null, 2)}\n`);
  return { ok: report.errors.length === 0, project, chapter: report.updated_through, output: OUTPUT, audit: report.audit, errors: report.errors, warnings: report.warnings };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (args.command !== 'update' || !args.project || !args.chapter) throw new CliError('USAGE', 'Usage: node foreshadowing-reconcile.js update <PROJECT> --chapter N');
  const report = write(args.project, args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 3;
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'foreshadowing-reconcile'); }
}

module.exports = { OUTPUT, argsOf, chapterId, idOf, projectOf, factLedgers, hookFacts, plannedEntry, build, write, run };
