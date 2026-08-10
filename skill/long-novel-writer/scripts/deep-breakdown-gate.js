#!/usr/bin/env node
'use strict';

/*
 * Evidence gate for the preproduction chain.  A benchmark list is not a
 * deconstruction: the selected books must be traceable, compared across
 * dimensions, and compiled into reusable mechanisms before story design.
 */
const fs = require('fs');
const path = require('path');
const { CliError, emitError } = require('./cap-utils');

const FILES = {
  pool: 'evidence/derivations/benchmark-pool.md',
  breakdown: 'analysis/breakdown.md',
  matrix: 'evidence/derivations/benchmark-feature-matrix.md',
  boundaries: 'evidence/derivations/source-boundaries.md',
};
const MIN_BOOKS = 10;
const MAX_BOOKS = 20;
const MIN_BREAKDOWN_CHARS = 1500;
const REQUIRED_DIMENSIONS = [
  { id: 'market', patterns: [/market|市场|承诺|定位/i, /promise|读者契约/i] },
  { id: 'framework', patterns: [/framework|结构|框架|卷纲|大纲/i] },
  { id: 'plot', patterns: [/plot|剧情|冲突|升级|反转/i] },
  { id: 'character', patterns: [/character|人物|关系|角色/i] },
  { id: 'chapter', patterns: [/chapter|章节|节奏|章法/i] },
  { id: 'prose', patterns: [/prose|文风|句法|对话|动作密度/i] },
  { id: 'retention', patterns: [/retention|留存|追读|钩子|爽点|情绪/i] },
];

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

function textOf(project, relative) {
  const file = path.join(project, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') : null;
}

function tableRows(text) {
  if (!text) return [];
  return text.split(/\r?\n/).filter((line) => /^\s*\|/.test(line) && !/^\s*\|?\s*[-:| ]+\|\s*$/.test(line) && !/^\s*\|\s*(?:id|编号|书名|title)\s*\|/i.test(line));
}

function benchmarkIds(text) {
  return [...new Set((String(text || '').match(/\bB\d{1,3}\b/gi) || []).map((item) => item.toUpperCase()))];
}

function activePoolRows(text) {
  return tableRows(text).filter((line) => /\b(?:selected|adopted|active|enabled)\b|已选|采用|启用/i.test(line));
}

function dimensionChecks(text) {
  return REQUIRED_DIMENSIONS.map((item) => ({ id: item.id, ok: item.patterns.some((pattern) => pattern.test(String(text || ''))) }));
}

function validate(projectInput) {
  const project = projectOf(projectInput);
  const errors = [];
  const details = { files: {}, pool_books: 0, pool_ids: [], breakdown_chars: 0, dimensions: [], source_ids_in_breakdown: [], source_ids_in_matrix: [] };
  for (const [key, relative] of Object.entries(FILES)) {
    const text = textOf(project, relative);
    details.files[key] = { path: relative, exists: text !== null, chars: text?.trim().length || 0 };
    if (text === null) errors.push({ code: 'DEEP_BREAKDOWN_FILE_MISSING', file: relative });
  }
  const pool = textOf(project, FILES.pool);
  const breakdown = textOf(project, FILES.breakdown);
  const matrix = textOf(project, FILES.matrix);
  const boundaries = textOf(project, FILES.boundaries);
  if (pool !== null) {
    const rows = activePoolRows(pool);
    details.pool_books = rows.length;
    details.pool_ids = benchmarkIds(rows.join('\n'));
    if (rows.length < MIN_BOOKS) errors.push({ code: 'BENCHMARK_POOL_TOO_SMALL', count: rows.length, minimum: MIN_BOOKS });
    if (rows.length > MAX_BOOKS) errors.push({ code: 'BENCHMARK_POOL_TOO_LARGE', count: rows.length, maximum: MAX_BOOKS });
    if (details.pool_ids.length < MIN_BOOKS) errors.push({ code: 'BENCHMARK_IDS_INCOMPLETE', count: details.pool_ids.length, minimum: MIN_BOOKS });
  }
  if (breakdown !== null) {
    details.breakdown_chars = breakdown.trim().length;
    if (details.breakdown_chars < MIN_BREAKDOWN_CHARS) errors.push({ code: 'DEEP_BREAKDOWN_TOO_THIN', chars: details.breakdown_chars, minimum: MIN_BREAKDOWN_CHARS });
    details.dimensions = dimensionChecks(breakdown);
    for (const item of details.dimensions) if (!item.ok) errors.push({ code: 'DEEP_BREAKDOWN_DIMENSION_MISSING', dimension: item.id });
    details.source_ids_in_breakdown = benchmarkIds(breakdown);
    if (details.pool_ids.length && details.source_ids_in_breakdown.length < Math.min(MIN_BOOKS, details.pool_ids.length)) errors.push({ code: 'DEEP_BREAKDOWN_PROVENANCE_THIN', referenced: details.source_ids_in_breakdown.length, selected: details.pool_ids.length });
  }
  if (matrix !== null) {
    details.source_ids_in_matrix = benchmarkIds(matrix);
    if (details.source_ids_in_matrix.length < 2) errors.push({ code: 'FEATURE_MATRIX_PROVENANCE_THIN', referenced: details.source_ids_in_matrix.length, minimum: 2 });
  }
  if (boundaries !== null && boundaries.trim().length < 300) errors.push({ code: 'SOURCE_BOUNDARIES_TOO_THIN', chars: boundaries.trim().length, minimum: 300 });
  return { ok: errors.length === 0, command: 'deep-breakdown-gate', project, files: FILES, details, errors, next: errors.length ? 'repair the cited evidence artifact and rerun deep-breakdown-gate' : 'preproduction evidence is deep enough for Book DNA compilation' };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project) throw new CliError('USAGE', 'Usage: node deep-breakdown-gate.js <PROJECT>');
  const report = validate(args.project);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 3;
  return report;
}

if (require.main === module) { try { run(); } catch (error) { process.exitCode = emitError(error, 'deep-breakdown-gate'); } }
module.exports = { FILES, MIN_BOOKS, MAX_BOOKS, MIN_BREAKDOWN_CHARS, REQUIRED_DIMENSIONS, argsOf, projectOf, tableRows, benchmarkIds, activePoolRows, dimensionChecks, validate, run };
