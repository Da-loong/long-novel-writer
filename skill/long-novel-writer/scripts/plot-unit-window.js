#!/usr/bin/env node
'use strict';

/*
 * Keeps the current chapter attached to a bounded plot unit between the
 * volume outline and individual chapter beat. It is deliberately file-first:
 * the unit plan is an editable outline table, while this JSON is a rebuildable
 * next-chapter window for the transaction/context/card pipeline.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const SOURCE = 'outline/plot-units.md';
const OUTPUT = 'state/plot-unit-window.json';
const REQUIRED = ['id', 'start', 'end', 'primary_drive', 'setup', 'turn', 'payoff', 'next'];

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
function sha256(text) { return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex'); }
function cellsOf(line) { return String(line || '').trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()); }
function tableRows(text) { return String(text || '').split(/\r?\n/).filter((line) => line.trim().startsWith('|')).map(cellsOf).filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell))); }
function keyOf(value) { return String(value || '').trim().toLowerCase().replace(/[\s_-]/g, ''); }
function column(headers, names, fallback) {
  const index = headers.findIndex((header) => names.includes(keyOf(header)));
  return index >= 0 ? index : fallback;
}

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function sourceUnits(project) {
  const file = path.join(project, SOURCE);
  if (!fs.existsSync(file)) return { file, source_sha256: null, units: [], warnings: [{ code: 'PLOT_UNIT_PLAN_MISSING', source: SOURCE }] };
  const sourceText = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const source_sha256 = sha256(sourceText);
  const rows = tableRows(sourceText);
  if (!rows.length) return { file, source_sha256, units: [], warnings: [{ code: 'PLOT_UNIT_PLAN_EMPTY', source: SOURCE }] };
  const headers = rows[0];
  const indexes = {
    id: column(headers, ['id', 'unitid', '\u5355\u5143id', '\u5267\u60c5\u5355\u5143id'], 0),
    start: column(headers, ['start', 'startchapter', '\u8d77\u7ae0', '\u5f00\u59cb\u7ae0\u8282'], 1),
    end: column(headers, ['end', 'endchapter', '\u6b62\u7ae0', '\u7ed3\u675f\u7ae0\u8282'], 2),
    primary_drive: column(headers, ['primarydrive', 'drive', '\u4e3b\u63a8\u8fdb', '\u5355\u5143\u76ee\u6807'], 3),
    setup: column(headers, ['setup', '\u94fa\u57ab'], 4),
    turn: column(headers, ['turn', 'midpoint', '\u8f6c\u6298', '\u4e2d\u70b9\u8f6c\u6298'], 5),
    payoff: column(headers, ['payoff', '\u91ca\u653e', '\u56de\u62a5'], 6),
    next: column(headers, ['next', 'nextpromise', '\u8854\u63a5', '\u4e0b\u4e00\u627f\u8bfa'], 7),
  };
  const errors = [];
  const units = rows.slice(1).map((cells, index) => {
    const item = Object.fromEntries(REQUIRED.map((field) => [field, String(cells[indexes[field]] || '').trim()]));
    item.start = Number.parseInt(item.start, 10); item.end = Number.parseInt(item.end, 10); item.row = index + 2;
    for (const field of REQUIRED) if (field === 'start' || field === 'end' ? !Number.isInteger(item[field]) || item[field] <= 0 : !item[field]) errors.push({ code: 'PLOT_UNIT_FIELD_INVALID', row: item.row, field });
    if (Number.isInteger(item.start) && Number.isInteger(item.end) && item.end < item.start) errors.push({ code: 'PLOT_UNIT_RANGE_INVALID', row: item.row, start: item.start, end: item.end });
    return item;
  });
  const ids = new Set();
  for (const unit of units) { if (ids.has(unit.id)) errors.push({ code: 'PLOT_UNIT_ID_DUPLICATE', id: unit.id }); ids.add(unit.id); }
  const ordered = [...units].sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < ordered.length; index++) if (ordered[index].start <= ordered[index - 1].end) errors.push({ code: 'PLOT_UNIT_RANGE_OVERLAP', left: ordered[index - 1].id, right: ordered[index].id });
  if (errors.length) throw new CliError('PLOT_UNIT_PLAN_INVALID', 'Plot-unit plan has invalid rows', { source: SOURCE, errors });
  return { file, source_sha256, units: ordered, warnings: [] };
}

function phaseOf(unit, chapter) {
  if (chapter === unit.end) return { phase: 'payoff', required_delivery: unit.payoff };
  const ratio = (chapter - unit.start) / Math.max(1, unit.end - unit.start);
  if (ratio < 0.34) return { phase: 'setup', required_delivery: unit.setup };
  if (ratio < 0.72) return { phase: 'turn', required_delivery: unit.turn };
  return { phase: 'payoff', required_delivery: unit.payoff };
}

function build(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const plan = sourceUnits(project);
  const state = JSON.parse(fs.readFileSync(path.join(project, 'state', 'project-state.json'), 'utf8'));
  const chapter = Number.parseInt(options.chapter || String(Number(state.updated_through || 0) + 1), 10);
  if (!Number.isInteger(chapter) || chapter <= 0) throw new CliError('INVALID_CHAPTER', 'chapter must be a positive integer', { chapter: options.chapter });
  const unit = plan.units.find((item) => chapter >= item.start && chapter <= item.end) || null;
  const warnings = [...plan.warnings];
  if (plan.units.length && !unit) warnings.push({ code: 'PLOT_UNIT_CHAPTER_UNASSIGNED', chapter, source: SOURCE });
  const data = {
    schema_version: '1.0', generated_at: new Date().toISOString(), target_chapter: chapter, source: SOURCE, source_sha256: plan.source_sha256,
    enabled: Boolean(unit), unit: unit ? { id: unit.id, start: unit.start, end: unit.end, primary_drive: unit.primary_drive, setup: unit.setup, turn: unit.turn, payoff: unit.payoff, next: unit.next, ...phaseOf(unit, chapter) } : null,
    warnings,
    rule: 'This window guides the active plot unit but cannot override the chapter beat, Canon, reader/platform contract, or literal-evidence gates.',
  };
  return { project, data };
}

function write(projectInput, options = {}) {
  const result = build(projectInput, options);
  atomicWrite(path.join(result.project, OUTPUT), `${JSON.stringify(result.data, null, 2)}\n`);
  return { ...result, output: OUTPUT };
}

function inspect(projectInput) {
  const project = projectOf(projectInput);
  const file = path.join(project, OUTPUT);
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  return { ok: Boolean(data), project, file: OUTPUT, target_chapter: data?.target_chapter || null, enabled: Boolean(data?.enabled), unit: data?.unit?.id || null, warnings: data?.warnings || [] };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.command || !args.project || !['update', 'audit'].includes(args.command)) throw new CliError('USAGE', 'Usage: node plot-unit-window.js update|audit <PROJECT> [--chapter N]');
  const result = args.command === 'update' ? write(args.project, args) : inspect(args.project);
  const output = args.command === 'update' ? { ok: true, project: result.project, output: result.output, target_chapter: result.data.target_chapter, enabled: result.data.enabled, unit: result.data.unit?.id || null, warnings: result.data.warnings } : result;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'plot-unit-window'); }
}

module.exports = { SOURCE, OUTPUT, REQUIRED, argsOf, cellsOf, tableRows, sourceUnits, phaseOf, build, write, inspect, run };
