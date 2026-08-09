#!/usr/bin/env node
'use strict';

/* Compiles reader feedback into bounded, chapter-verifiable writing rules. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const SOURCE = 'state/feedback-ledger.md';
const OUTPUT = 'state/feedback-rules.json';
const CLOSED = /^(?:closed|resolved|done|archived|ignored|rejected|已关闭|已解决|已完成|已验证|已归档|已忽略|不采纳)$/i;
const PAUSED = /^(?:paused|hold|deferred|暂缓|暂停|搁置)$/i;
const PLACEHOLDER = /^(?:-|—|待填写|待补充|pending|todo|n\/a)$/i;

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
function cellsOf(line) { return String(line || '').trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()); }
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function numberOf(value) { const match = String(value || '').match(/\d+/); return match ? Number.parseInt(match[0], 10) : null; }
function activeStatus(value) { const status = String(value || '').trim(); return !CLOSED.test(status) && !PAUSED.test(status); }
function usable(value) { const text = String(value || '').trim(); return Boolean(text) && !PLACEHOLDER.test(text); }
function invalid(message, details) { throw new CliError('FEEDBACK_RULES_INVALID', message, details); }

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function rowsOf(text) {
  return String(text || '').split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim().startsWith('|')) return [];
    const cells = cellsOf(line);
    if (cells.length < 6 || cells.every((cell) => /^:?-{3,}:?$/.test(cell)) || /^(?:日期|date)$/i.test(cells[0])) return [];
    const [reported_at, feedback, layer, action, verification, status] = cells;
    return [{ row: index + 1, reported_at, feedback, layer, action, verification_chapter: numberOf(verification), status: status || 'active' }];
  });
}

function compileData(text) {
  const warnings = [];
  const rules = [];
  const keys = new Set();
  for (const row of rowsOf(text)) {
    if (!usable(row.feedback)) { warnings.push({ code: 'FEEDBACK_RULE_FEEDBACK_EMPTY', row: row.row }); continue; }
    if (!usable(row.action)) { warnings.push({ code: 'FEEDBACK_RULE_ACTION_EMPTY', row: row.row, feedback: row.feedback }); continue; }
    if (!activeStatus(row.status)) continue;
    const key = `${row.reported_at}\u0000${row.feedback}\u0000${row.action}`;
    if (keys.has(key)) { warnings.push({ code: 'FEEDBACK_RULE_DUPLICATE', row: row.row, feedback: row.feedback }); continue; }
    keys.add(key);
    rules.push({
      id: `feedback-${sha256(key).slice(0, 12)}`,
      source_row: row.row,
      reported_at: row.reported_at || null,
      feedback: row.feedback,
      layer: row.layer || 'reader',
      rule: row.action,
      verification_chapter: row.verification_chapter,
      status: row.status,
      active: true,
    });
  }
  return { rules, warnings };
}

function compile(projectInput) {
  const project = projectOf(projectInput);
  const source = path.join(project, SOURCE);
  if (!fs.existsSync(source)) throw new CliError('FEEDBACK_LEDGER_MISSING', 'Missing feedback ledger', { source: SOURCE });
  const sourceText = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
  const compiled = compileData(sourceText);
  const payload = {
    schema_version: '1.0', generated_at: new Date().toISOString(), source: SOURCE,
    source_sha256: sha256(sourceText), rules: compiled.rules, warnings: compiled.warnings,
  };
  atomicWrite(path.join(project, OUTPUT), `${JSON.stringify(payload, null, 2)}\n`);
  return { ok: true, project, output: OUTPUT, rule_count: payload.rules.length, warnings: payload.warnings, data: payload };
}

function read(projectInput) {
  const project = projectOf(projectInput);
  const file = path.join(project, OUTPUT);
  if (!fs.existsSync(file)) return { schema_version: '1.0', generated_at: null, source: SOURCE, source_sha256: null, rules: [], warnings: [] };
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { invalid('Feedback rules JSON parse failed', { file: OUTPUT, message: error.message }); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.rules)) invalid('Feedback rules require a rules array', { file: OUTPUT });
  return { ...value, rules: value.rules };
}

function due(projectInput, chapter) {
  const target = Number.parseInt(chapter, 10);
  if (!Number.isInteger(target) || target <= 0) throw new CliError('INVALID_CHAPTER', 'chapter must be a positive integer', { chapter });
  return read(projectInput).rules.filter((rule) => {
    const verification = Number(rule?.verification_chapter);
    return rule?.active === true && (rule.verification_chapter === null || rule.verification_chapter === undefined || !Number.isInteger(verification) || verification <= target);
  });
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (args.command !== 'compile' || !args.project) throw new CliError('USAGE', 'Usage: node feedback-rules.js compile <PROJECT>');
  const report = compile(args.project);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'feedback-rules'); }
}

module.exports = { SOURCE, OUTPUT, CLOSED, PAUSED, argsOf, cellsOf, sha256, numberOf, activeStatus, usable, projectOf, rowsOf, compileData, compile, read, due, run };
