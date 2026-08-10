#!/usr/bin/env node
'use strict';

/*
 * Compile a multi-title benchmark matrix into a compact, chapter-facing Book
 * DNA.  The matrix permits reusable narrative mechanisms only; source text,
 * names, plots, and one-title imitation stay outside the writing context.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const SOURCE = 'evidence/derivations/benchmark-feature-matrix.md';
const BOUNDARIES = 'evidence/derivations/source-boundaries.md';
const OUTPUT = 'state/book-dna.json';
const ACTIVE = /^(?:active|adopted|enabled|\u91c7\u7eb3|\u5df2\u91c7\u7eb3|\u542f\u7528)$/i;
const PLACEHOLDER = /^(?:-|\u5f85\u586b\u5199|\u5f85\u8865\u5145|pending|todo|n\/a)$/i;
const DIMENSIONS = new Set(['market', 'framework', 'plot', 'character', 'chapter', 'prose', 'retention']);
const DIMENSION_ALIASES = {
  '\u5e02\u573a\u627f\u8bfa': 'market', '\u5e02\u573a': 'market',
  '\u6846\u67b6': 'framework',
  '\u60c5\u8282\u63a8\u8fdb': 'plot',
  '\u4eba\u7269\u5f15\u64ce': 'character',
  '\u7ae0\u8282\u8282\u594f': 'chapter',
  '\u6587\u98ce\u884c\u4e3a': 'prose',
  '\u7559\u5b58\u673a\u5236': 'retention',
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

function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function usable(value) { const text = String(value || '').trim(); return Boolean(text) && !PLACEHOLDER.test(text); }
function cellsOf(line) { return String(line || '').trim().replace(/^\||\|$/g, '').split('|').map((item) => item.trim()); }
function normalHeader(value) { return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ''); }
function invalid(message, details) { throw new CliError('BOOK_DNA_INVALID', message, details); }

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function columnsOf(header) {
  const aliases = {
    id: ['id', '\u7279\u5f81id', 'featureid', '\u673a\u5236id'],
    dimension: ['dimension', '\u7ef4\u5ea6'],
    mechanism: ['mechanism', 'abstraction', '\u673a\u5236', '\u53ef\u590d\u7528\u673a\u5236', '\u62bd\u8c61\u673a\u5236\u63cf\u8ff0', '\u673a\u5236\u63cf\u8ff0'],
    evidence: ['evidence', '\u8bc1\u636e', '\u8bc1\u636e\u6458\u8981', '\u8bc1\u636e\u5f15\u7528'],
    sources: ['sources', 'sourceids', '\u6807\u6746id', '\u6765\u6e90id'],
    scope: ['scope', '\u9002\u7528\u8303\u56f4'],
    status: ['status', '\u72b6\u6001'],
  };
  const normalized = header.map(normalHeader);
  const find = (values) => normalized.findIndex((value) => values.includes(value) || values.some((alias) => alias.length > 1 && value.startsWith(alias)));
  return Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, find(values)]));
}

function rowsOf(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim().startsWith('|')) continue;
    const header = cellsOf(lines[index]);
    const columns = columnsOf(header);
    // A compact matrix may omit scope/status because every row is explicitly
    // an adopted, whole-book mechanism. Keep the strict five evidence fields
    // while inferring those two safe defaults.
    const required = ['id', 'dimension', 'mechanism', 'evidence', 'sources'];
    if (required.some((name) => columns[name] < 0)) continue;
    const rows = [];
    for (let cursor = index + 2; cursor < lines.length && lines[cursor].trim().startsWith('|'); cursor++) {
      const cells = cellsOf(lines[cursor]);
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      const field = (name) => cells[columns[name]] || '';
      rows.push({ row: cursor + 1, id: field('id'), dimension: field('dimension'), mechanism: field('mechanism'), evidence: field('evidence'), sources: field('sources'), scope: columns.scope >= 0 ? field('scope') : '全书', status: columns.status >= 0 ? field('status') : 'adopted' });
    }
    return rows;
  }
  return [];
}

function sourceIdsOf(value) {
  return [...new Set(String(value || '').split(/[,\uff0c\s]+/).map((item) => item.trim()).filter(Boolean))];
}

function scopeOf(value) {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase().replace(/\s+/g, '');
  if (!usable(raw) || /^(?:all|\u5168\u4e66|fullbook)$/i.test(normalized)) return { raw: raw || '\u5168\u4e66', kind: 'all' };
  if (/^(?:opening|\u5f00\u7bc7|\u9ec4\u91d1\u4e09\u7ae0)$/i.test(normalized)) return { raw, kind: 'opening' };
  const match = normalized.match(/^(?:chapter|ch|\u7ae0\u8282)[:\uff1a]?(\d+)(?:-(\d+))?$/i);
  return match ? { raw, kind: 'chapter_range', start: Number(match[1]), end: Number(match[2] || match[1]) } : null;
}

function compileData(text) {
  const warnings = [];
  const mechanisms = [];
  const ids = new Set();
  for (const row of rowsOf(text)) {
    if (!ACTIVE.test(String(row.status || '').trim())) continue;
    if (!/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(row.id)) { warnings.push({ code: 'BOOK_DNA_ID_INVALID', row: row.row, id: row.id }); continue; }
    if (ids.has(row.id)) { warnings.push({ code: 'BOOK_DNA_DUPLICATE_ID', row: row.row, id: row.id }); continue; }
    const rawDimension = String(row.dimension || '').trim().toLowerCase();
    const dimension = DIMENSION_ALIASES[rawDimension] || rawDimension;
    const sources = sourceIdsOf(row.sources);
    const scope = scopeOf(row.scope);
    if (!DIMENSIONS.has(dimension)) { warnings.push({ code: 'BOOK_DNA_DIMENSION_INVALID', row: row.row, id: row.id, dimension: row.dimension }); continue; }
    if (!usable(row.mechanism)) { warnings.push({ code: 'BOOK_DNA_MECHANISM_EMPTY', row: row.row, id: row.id }); continue; }
    if (!usable(row.evidence)) { warnings.push({ code: 'BOOK_DNA_EVIDENCE_MISSING', row: row.row, id: row.id }); continue; }
    if (sources.length < 2) { warnings.push({ code: 'BOOK_DNA_MULTI_SOURCE_REQUIRED', row: row.row, id: row.id, source_ids: sources }); continue; }
    if (!scope) { warnings.push({ code: 'BOOK_DNA_SCOPE_INVALID', row: row.row, id: row.id, scope: row.scope }); continue; }
    ids.add(row.id);
    mechanisms.push({ id: row.id, source_row: row.row, dimension, mechanism: row.mechanism, evidence: row.evidence, source_ids: sources, scope, status: row.status, active: true });
  }
  return { mechanisms, warnings };
}

function compile(projectInput) {
  const project = projectOf(projectInput);
  const source = path.join(project, SOURCE);
  const boundaries = path.join(project, BOUNDARIES);
  // Existing books may predate the benchmark layer.  Preserve their current
  // production path with an explicit empty contract; a partially added layer
  // is still an error because its provenance cannot be checked.
  if (!fs.existsSync(source) && !fs.existsSync(boundaries)) {
    const payload = { schema_version: '1.0', generated_at: new Date().toISOString(), source: SOURCE, source_sha256: null, boundaries: BOUNDARIES, boundaries_sha256: null, mechanisms: [], by_dimension: {}, warnings: [{ code: 'BOOK_DNA_NOT_CONFIGURED', source: SOURCE }], rule: 'No benchmark mechanisms are active until both Book DNA source files are configured.' };
    atomicWrite(path.join(project, OUTPUT), `${JSON.stringify(payload, null, 2)}\n`);
    return { ok: true, project, output: OUTPUT, mechanism_count: 0, dimension_count: 0, warnings: payload.warnings, data: payload };
  }
  if (!fs.existsSync(source)) throw new CliError('BOOK_DNA_MATRIX_MISSING', 'Missing benchmark feature matrix', { source: SOURCE });
  if (!fs.existsSync(boundaries)) throw new CliError('BOOK_DNA_BOUNDARIES_MISSING', 'Missing source-boundaries file', { source: BOUNDARIES });
  const text = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
  const boundaryText = fs.readFileSync(boundaries, 'utf8').replace(/^\uFEFF/, '');
  const compiled = compileData(text);
  const byDimension = Object.fromEntries([...DIMENSIONS].map((dimension) => [dimension, compiled.mechanisms.filter((item) => item.dimension === dimension)]));
  const payload = {
    schema_version: '1.0', generated_at: new Date().toISOString(), source: SOURCE, source_sha256: sha256(text),
    boundaries: BOUNDARIES, boundaries_sha256: sha256(boundaryText), mechanisms: compiled.mechanisms, by_dimension: byDimension,
    warnings: compiled.warnings,
    rule: 'Use only abstract multi-source mechanisms. Do not reuse source text, names, distinctive scenes, plot sequences, settings, or character configurations.',
  };
  atomicWrite(path.join(project, OUTPUT), `${JSON.stringify(payload, null, 2)}\n`);
  return { ok: true, project, output: OUTPUT, mechanism_count: payload.mechanisms.length, dimension_count: Object.values(byDimension).filter((items) => items.length).length, warnings: payload.warnings, data: payload };
}

function read(projectInput) {
  const project = projectOf(projectInput);
  const file = path.join(project, OUTPUT);
  if (!fs.existsSync(file)) return { schema_version: '1.0', generated_at: null, source: SOURCE, mechanisms: [], by_dimension: {}, warnings: [] };
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { invalid('Book DNA JSON parse failed', { file: OUTPUT, message: error.message }); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.mechanisms)) invalid('Book DNA requires a mechanisms array', { file: OUTPUT });
  return value;
}

function applies(item, chapter) {
  if (!item?.active) return false;
  const scope = item.scope || {};
  if (scope.kind === 'all') return true;
  if (scope.kind === 'opening') return Number(chapter) <= 3;
  return scope.kind === 'chapter_range' && Number(chapter) >= Number(scope.start) && Number(chapter) <= Number(scope.end);
}

function due(projectInput, chapter) {
  const target = Number.parseInt(chapter, 10);
  if (!Number.isInteger(target) || target <= 0) throw new CliError('INVALID_CHAPTER', 'chapter must be a positive integer', { chapter });
  return read(projectInput).mechanisms.filter((item) => applies(item, target));
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (args.command !== 'compile' || !args.project) throw new CliError('USAGE', 'Usage: node book-dna.js compile <PROJECT>');
  const report = compile(args.project);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'book-dna'); }
}

module.exports = { SOURCE, BOUNDARIES, OUTPUT, ACTIVE, DIMENSIONS, argsOf, sha256, usable, cellsOf, columnsOf, rowsOf, sourceIdsOf, scopeOf, compileData, compile, read, applies, due, run };
