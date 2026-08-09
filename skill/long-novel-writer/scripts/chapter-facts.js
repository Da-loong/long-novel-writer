#!/usr/bin/env node
'use strict';

/* Validates an extractor's chapter facts before they become reusable context. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const FACT_KINDS = new Set(['event', 'character_state', 'location', 'resource', 'knowledge', 'relationship', 'timeline', 'hook_open', 'hook_closed']);
const RESOURCE_TYPES = new Set(['physical_item', 'consumable', 'currency', 'ability', 'credential', 'relationship_token', 'information', 'other']);
const RESOURCE_ACTIONS = new Set(['introduced', 'acquired', 'consumed', 'revealed', 'hidden', 'lost', 'damaged', 'restored', 'transferred']);
const RESOURCE_STATUSES = new Set(['available', 'consumed', 'hidden', 'lost', 'damaged']);
const RESOURCE_RISKS = new Set(['normal', 'high']);
const FACT_LEDGER_DIR = 'state/fact-ledger';

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
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function invalid(message, details) { throw new CliError('CHAPTER_FACTS_INVALID', message, details); }

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function manuscriptOf(project, chapter) {
  const directory = path.join(project, 'manuscript');
  const pattern = new RegExp(`^ch-${chapterId(chapter)}-.+\\.md$`, 'i');
  const files = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => pattern.test(name)).sort() : [];
  if (files.length !== 1) throw new CliError('CHAPTER_ARTIFACT_SHAPE', `Expected exactly one manuscript for chapter ${chapter}`, { chapter: Number(chapter), files });
  const file = path.join(directory, files[0]);
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const body = text.replace(/^#{1,6}[^\n]*(?:\r?\n|$)/, '').trim();
  if (!body) throw new CliError('CHAPTER_EMPTY', `Chapter ${chapter} has no manuscript body`, { chapter: Number(chapter) });
  return { file, relative: normal(path.relative(project, file)), text, body };
}

function reportPath(project, chapter, file) {
  const relative = normal(file || `analysis/chapter-facts-ch${chapterId(chapter)}.json`);
  const absolute = path.resolve(project, relative);
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative) || path.relative(project, absolute).startsWith('..')) throw new CliError('PATH_ESCAPE', 'Chapter fact report must stay inside project', { file: relative });
  return { absolute, relative };
}

function ledgerPath(project, chapter) { return path.join(project, FACT_LEDGER_DIR, `ch-${chapterId(chapter)}.json`); }

function validateResourceDelta(value, chapter, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Resource fact requires a structured resource delta', { chapter, index });
  const holder = String(value.holder || '').trim();
  const key = String(value.key || '').trim();
  const type = String(value.type || '').trim();
  const action = String(value.action || '').trim();
  const statusAfter = String(value.status_after || '').trim();
  const risk = String(value.risk || 'normal').trim() || 'normal';
  const expectedUse = value.expected_use_by_chapter === undefined || value.expected_use_by_chapter === null || value.expected_use_by_chapter === '' ? null : Number(value.expected_use_by_chapter);
  if (!holder || !key || !RESOURCE_TYPES.has(type) || !RESOURCE_ACTIONS.has(action) || !RESOURCE_STATUSES.has(statusAfter) || !RESOURCE_RISKS.has(risk)) invalid('Resource delta has invalid holder, key, type, action, status, or risk', { chapter, index, holder, key, type, action, status_after: statusAfter, risk });
  if (holder.length > 160 || key.length > 160 || (expectedUse !== null && (!Number.isInteger(expectedUse) || expectedUse < Number(chapter)))) invalid('Resource delta exceeds bounds or has an invalid expected use chapter', { chapter, index, holder, key, expected_use_by_chapter: value.expected_use_by_chapter });
  return { holder, key, type, action, status_after: statusAfter, risk, expected_use_by_chapter: expectedUse };
}

function validateData(data, manuscript, chapter) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) invalid('Chapter facts must be a JSON object', { chapter });
  if (!['1.0', '1.1'].includes(String(data.schema_version || ''))) invalid('Chapter facts schema_version must be 1.0 or 1.1', { chapter, schema_version: data.schema_version });
  if (Number(data.chapter) !== Number(chapter)) invalid('Chapter facts chapter does not match manuscript', { expected: Number(chapter), actual: data.chapter });
  if (!String(data.extractor_id || '').trim()) invalid('Chapter facts extractor_id is required', { chapter });
  const summary = String(data.summary || '').trim();
  if (!summary || summary.length > 700) invalid('Chapter facts summary is required and must stay concise', { chapter });
  if (!Array.isArray(data.facts) || data.facts.length < 1 || data.facts.length > 24) invalid('Chapter facts needs 1 to 24 fact records', { chapter, count: Array.isArray(data.facts) ? data.facts.length : null });
  const seen = new Set();
  const facts = data.facts.map((fact, index) => {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) invalid('Chapter fact must be an object', { chapter, index });
    const kind = String(fact.kind || '').trim();
    const subject = String(fact.subject || '').trim();
    const claim = String(fact.claim || '').trim();
    const evidence = String(fact.evidence || '').trim();
    if (!FACT_KINDS.has(kind) || !subject || !claim || !evidence) invalid('Chapter fact needs kind, subject, claim, and evidence', { chapter, index, kind });
    if (subject.length > 160 || claim.length > 600 || evidence.length > 800) invalid('Chapter fact field exceeds its bounded length', { chapter, index });
    if (!manuscript.body.includes(evidence)) invalid('Chapter fact evidence must be a literal manuscript excerpt', { chapter, index, evidence });
    const key = `${kind}\u0000${subject}\u0000${claim}`;
    if (seen.has(key)) invalid('Chapter facts contain a duplicate claim', { chapter, index, kind, subject, claim });
    seen.add(key);
    const resource = kind === 'resource' ? validateResourceDelta(fact.resource, chapter, index) : null;
    if (kind !== 'resource' && fact.resource !== undefined) invalid('Only resource facts may include a resource delta', { chapter, index, kind });
    return { kind, subject, claim, evidence, ...(resource ? { resource } : {}) };
  });
  return {
    schema_version: '1.1', chapter: Number(chapter), extractor_id: String(data.extractor_id).trim(), summary, facts,
    manuscript: manuscript.relative, manuscript_sha256: sha256(manuscript.text), extracted_at: new Date().toISOString(),
  };
}

function validate(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const chapter = Number.parseInt(options.chapter, 10);
  if (!Number.isInteger(chapter) || chapter <= 0) throw new CliError('INVALID_CHAPTER', 'chapter must be a positive integer', { chapter: options.chapter });
  const manuscript = manuscriptOf(project, chapter);
  const report = reportPath(project, chapter, options.file);
  if (!fs.existsSync(report.absolute)) throw new CliError('CHAPTER_FACTS_MISSING', `Chapter fact report is missing: ${report.relative}`, { chapter, file: report.relative });
  let raw;
  try { raw = JSON.parse(fs.readFileSync(report.absolute, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { invalid('Chapter fact report JSON parse failed', { chapter, file: report.relative, message: error.message }); }
  const data = validateData(raw, manuscript, chapter);
  atomicWrite(report.absolute, `${JSON.stringify(data, null, 2)}\n`);
  const ledger = { ...data, report: report.relative, report_sha256: sha256(fs.readFileSync(report.absolute, 'utf8')) };
  const output = ledgerPath(project, chapter);
  atomicWrite(output, `${JSON.stringify(ledger, null, 2)}\n`);
  return { ok: true, project, chapter, file: report.relative, ledger: normal(path.relative(project, output)), data };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (args.command !== 'validate' || !args.project || !args.chapter) throw new CliError('USAGE', 'Usage: node chapter-facts.js validate <PROJECT> --chapter N [--file analysis/report.json]');
  const report = validate(args.project, args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'chapter-facts'); }
}

module.exports = { FACT_KINDS, RESOURCE_TYPES, RESOURCE_ACTIONS, RESOURCE_STATUSES, RESOURCE_RISKS, FACT_LEDGER_DIR, argsOf, chapterId, sha256, projectOf, manuscriptOf, reportPath, ledgerPath, validateResourceDelta, validateData, validate, run };
