#!/usr/bin/env node
'use strict';

/*
 * Compiles evidence-backed, reusable style signals into a small chapter-facing
 * contract.  Source-specific names, plots, or phrasings stay in the evidence
 * vault; only explicitly adopted abstractions enter the writing loop.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const SOURCE = 'evidence/derivations/style-signals.md';
const OUTPUT = 'state/style-contract.json';
const ACTIVE = /^(?:active|adopted|enabled|采纳|已采纳|启用)$/i;
const PLACEHOLDER = /^(?:-|—|待填写|待补充|pending|todo|n\/a)$/i;
const DIMENSIONS = new Map([
  ['narrative', 'narrative'], ['叙事', 'narrative'], ['叙事声音', 'narrative'],
  ['language', 'language'], ['语言', 'language'], ['语体', 'language'],
  ['rhythm', 'rhythm'], ['节奏', 'rhythm'],
  ['dialogue', 'dialogue'], ['对话', 'dialogue'],
  ['emotion', 'emotion'], ['情感', 'emotion'], ['情绪', 'emotion'],
  ['format', 'format'], ['格式', 'format'],
  ['negative', 'negative'], ['负面约束', 'negative'], ['禁用', 'negative'],
]);

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

function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function usable(value) { const text = String(value || '').trim(); return Boolean(text) && !PLACEHOLDER.test(text); }
function cellsOf(line) { return String(line || '').trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()); }
function normalHeader(value) { return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ''); }
function invalid(message, details) { throw new CliError('STYLE_CONTRACT_INVALID', message, details); }

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function columnsOf(header) {
  const aliases = {
    id: ['id', '信号id', '规则id'],
    dimension: ['dimension', '维度'],
    signal: ['reusablesignal', '可复用信号', '信号'],
    evidence: ['evidence', '证据来源', '来源证据', '来源'],
    scope: ['scope', '适用范围'],
    status: ['status', '状态'],
  };
  const normalized = header.map(normalHeader);
  return Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, normalized.findIndex((value) => names.includes(value))]));
}

function rowsOf(text) {
  const lines = String(text || '').split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim().startsWith('|')) continue;
    const header = cellsOf(lines[index]);
    const columns = columnsOf(header);
    if (Object.values(columns).some((column) => column < 0)) continue;
    for (let cursor = index + 2; cursor < lines.length && lines[cursor].trim().startsWith('|'); cursor++) {
      const cells = cellsOf(lines[cursor]);
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      const field = (name) => cells[columns[name]] || '';
      rows.push({ row: cursor + 1, id: field('id'), dimension: field('dimension'), signal: field('signal'), evidence: field('evidence'), scope: field('scope'), status: field('status') });
    }
    break;
  }
  return rows;
}

function normalDimension(value) { return DIMENSIONS.get(String(value || '').trim().toLowerCase()) || null; }

function scopeOf(value) {
  const source = String(value || '').trim();
  const normalized = source.toLowerCase().replace(/\s+/g, '');
  if (!usable(source) || /^(?:all|全书|全文|fullbook)$/i.test(normalized)) return { raw: source || '全书', kind: 'all' };
  if (/^(?:opening|开篇|黄金三章)$/i.test(normalized)) return { raw: source, kind: 'opening' };
  const match = normalized.match(/^(?:chapter|ch|章节)[:：]?(\d+)(?:-(\d+))?$/i);
  if (match) return { raw: source, kind: 'chapter_range', start: Number(match[1]), end: Number(match[2] || match[1]) };
  return null;
}

function compileData(text) {
  const warnings = [];
  const signals = [];
  const ids = new Set();
  for (const row of rowsOf(text)) {
    if (!ACTIVE.test(String(row.status || '').trim())) continue;
    if (!/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(row.id)) { warnings.push({ code: 'STYLE_SIGNAL_ID_INVALID', row: row.row, id: row.id }); continue; }
    if (ids.has(row.id)) { warnings.push({ code: 'STYLE_SIGNAL_DUPLICATE', row: row.row, id: row.id }); continue; }
    const dimension = normalDimension(row.dimension);
    const scope = scopeOf(row.scope);
    if (!dimension) { warnings.push({ code: 'STYLE_SIGNAL_DIMENSION_INVALID', row: row.row, id: row.id, dimension: row.dimension }); continue; }
    if (!usable(row.signal)) { warnings.push({ code: 'STYLE_SIGNAL_EMPTY', row: row.row, id: row.id }); continue; }
    if (!usable(row.evidence)) { warnings.push({ code: 'STYLE_SIGNAL_EVIDENCE_MISSING', row: row.row, id: row.id }); continue; }
    if (!scope) { warnings.push({ code: 'STYLE_SIGNAL_SCOPE_INVALID', row: row.row, id: row.id, scope: row.scope }); continue; }
    ids.add(row.id);
    signals.push({ id: row.id, source_row: row.row, dimension, signal: row.signal, evidence: row.evidence, scope, status: row.status, active: true });
  }
  return { signals, warnings };
}

function compile(projectInput) {
  const project = projectOf(projectInput);
  const source = path.join(project, SOURCE);
  if (!fs.existsSync(source)) throw new CliError('STYLE_SIGNALS_MISSING', 'Missing style signal adoption table', { source: SOURCE });
  const text = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
  const compiled = compileData(text);
  const payload = {
    schema_version: '1.0', generated_at: new Date().toISOString(), source: SOURCE,
    source_sha256: sha256(text), signals: compiled.signals, warnings: compiled.warnings,
  };
  atomicWrite(path.join(project, OUTPUT), `${JSON.stringify(payload, null, 2)}\n`);
  return { ok: true, project, output: OUTPUT, signal_count: payload.signals.length, warnings: payload.warnings, data: payload };
}

function read(projectInput) {
  const project = projectOf(projectInput);
  const file = path.join(project, OUTPUT);
  if (!fs.existsSync(file)) return { schema_version: '1.0', generated_at: null, source: SOURCE, source_sha256: null, signals: [], warnings: [] };
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { invalid('Style contract JSON parse failed', { file: OUTPUT, message: error.message }); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.signals)) invalid('Style contract requires a signals array', { file: OUTPUT });
  return { ...value, signals: value.signals };
}

function applies(signal, chapter) {
  if (!signal?.active) return false;
  const scope = signal.scope || {};
  if (scope.kind === 'all') return true;
  if (scope.kind === 'opening') return chapter <= 3;
  return scope.kind === 'chapter_range' && chapter >= Number(scope.start) && chapter <= Number(scope.end);
}

function due(projectInput, chapter) {
  const target = Number.parseInt(chapter, 10);
  if (!Number.isInteger(target) || target <= 0) throw new CliError('INVALID_CHAPTER', 'chapter must be a positive integer', { chapter });
  return read(projectInput).signals.filter((signal) => applies(signal, target));
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (args.command !== 'compile' || !args.project) throw new CliError('USAGE', 'Usage: node style-contract.js compile <PROJECT>');
  const report = compile(args.project);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'style-contract'); }
}

module.exports = { SOURCE, OUTPUT, ACTIVE, DIMENSIONS, argsOf, sha256, usable, cellsOf, columnsOf, rowsOf, normalDimension, scopeOf, compileData, compile, read, applies, due, run };
