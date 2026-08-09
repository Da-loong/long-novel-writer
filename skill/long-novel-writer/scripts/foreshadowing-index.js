#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const LEDGER = 'outline/foreshadowing-ledger.md';
const OUTPUT = 'state/foreshadowing-index.json';
const CLOSED = /^(?:\u56de\u6536|\u5df2\u56de\u6536|closed|done|resolved|\u5b8c\u6210|\u5e9f\u5f03|abandoned)$/i;

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) args[value.slice(2)] = true;
      else args[value.slice(2)] = argv[++index];
    }
    else if (!args.project) args.project = value;
  }
  return args;
}

function cellsOf(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function numbersOf(value) {
  return [...String(value || '').matchAll(/\d+/g)].map((match) => Number.parseInt(match[0], 10)).filter((number) => number > 0);
}

function dependenciesOf(value) {
  const match = String(value || '').match(/(?:depends?|\u4f9d\u8d56)\s*[:\uff1a]\s*([A-Za-z0-9_,\uff0c\-\s]+)/i);
  if (!match) return [];
  return [...new Set(match[1].split(/[,\uff0c\s]+/).map((item) => item.trim()).filter(Boolean))];
}

function parseLedger(text) {
  const nodes = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim().startsWith('|')) continue;
    const cells = cellsOf(raw);
    if (cells.length < 6 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const [id, setup, content, reinforcement, payoff, status] = cells;
    if (/^(?:id|\u7f16\u53f7)$/i.test(id) || /\u4f0f\u7b14/.test(id)) continue;
    if (!id) continue;
    nodes.push({
      id,
      setup_chapter: numbersOf(setup)[0] || null,
      content,
      reinforcement_chapters: numbersOf(reinforcement),
      payoff_deadline_chapter: numbersOf(payoff)[0] || null,
      status: status || 'open',
      active: !CLOSED.test(status || ''),
      depends_on: dependenciesOf(content),
    });
  }
  return nodes;
}

function cyclePaths(nodes) {
  const byId = new Map();
  for (const node of nodes) if (!byId.has(node.id)) byId.set(node.id, node);
  const visited = new Set();
  const visiting = new Set();
  const cycles = [];
  function visit(id, trail) {
    if (visiting.has(id)) { cycles.push([...trail.slice(trail.indexOf(id)), id]); return; }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).depends_on) visit(dependency, [...trail, id]);
    visiting.delete(id); visited.add(id);
  }
  for (const node of nodes) visit(node.id, []);
  return cycles;
}

function validate(nodes) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) errors.push({ code: 'FORESHADOW_DUPLICATE_ID', id: node.id });
    ids.add(node.id);
    if (!node.setup_chapter) errors.push({ code: 'FORESHADOW_SETUP_INVALID', id: node.id });
    if (!node.payoff_deadline_chapter) errors.push({ code: 'FORESHADOW_PAYOFF_INVALID', id: node.id });
    if (node.setup_chapter && node.payoff_deadline_chapter && node.payoff_deadline_chapter < node.setup_chapter) errors.push({ code: 'FORESHADOW_PAYOFF_BEFORE_SETUP', id: node.id });
    for (const dependency of node.depends_on) if (!nodes.some((item) => item.id === dependency)) warnings.push({ code: 'FORESHADOW_DEPENDENCY_MISSING', id: node.id, dependency });
  }
  for (const cycle of cyclePaths(nodes)) errors.push({ code: 'FORESHADOW_DEPENDENCY_CYCLE', cycle });
  return { errors, warnings };
}

function dueOf(nodes, chapter) {
  const due = [];
  for (const node of nodes.filter((item) => item.active)) {
    if (node.setup_chapter === chapter) due.push({ id: node.id, kind: 'setup', chapter, content: node.content });
    if (node.reinforcement_chapters.includes(chapter)) due.push({ id: node.id, kind: 'reinforcement', chapter, content: node.content });
    if (node.payoff_deadline_chapter === chapter) due.push({ id: node.id, kind: 'payoff_due', chapter, content: node.content });
    if (node.payoff_deadline_chapter && node.payoff_deadline_chapter < chapter) due.push({ id: node.id, kind: 'overdue', deadline: node.payoff_deadline_chapter, content: node.content });
  }
  return due;
}

function build(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  const ledger = path.join(project, LEDGER);
  if (!fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', `Project does not exist: ${project}`, { project });
  if (!fs.existsSync(ledger)) throw new CliError('FORESHADOW_LEDGER_MISSING', 'Missing foreshadowing ledger', { ledger });
  const chapter = options.chapter === undefined ? null : Number.parseInt(options.chapter, 10);
  if (options.chapter !== undefined && (!Number.isFinite(chapter) || chapter <= 0)) throw new CliError('INVALID_CHAPTER', 'Chapter must be a positive integer', { chapter: options.chapter });
  const nodes = parseLedger(fs.readFileSync(ledger, 'utf8').replace(/^\uFEFF/, '')).sort((a, b) => a.setup_chapter - b.setup_chapter || a.id.localeCompare(b.id));
  const validation = validate(nodes);
  return {
    schema_version: '1.0', generated_at: new Date().toISOString(), source: LEDGER, target_chapter: chapter,
    nodes, edges: nodes.flatMap((node) => node.depends_on.map((to) => ({ from: node.id, to }))),
    due: chapter ? dueOf(nodes, chapter) : [], ...validation,
  };
}

function write(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  const index = build(project, options);
  const output = path.join(project, OUTPUT);
  atomicWrite(output, `${JSON.stringify(index, null, 2)}\n`);
  return { ...index, output };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project) throw new CliError('USAGE', 'Usage: node foreshadowing-index.js <project> [--chapter N] [--write]');
  const result = args.write === true ? write(args.project, args) : build(args.project, args);
  const report = { ok: result.errors.length === 0, output: result.output || null, node_count: result.nodes.length, due: result.due, errors: result.errors, warnings: result.warnings };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 3;
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'foreshadowing-index'); }
}

module.exports = { LEDGER, OUTPUT, argsOf, cellsOf, numbersOf, dependenciesOf, parseLedger, validate, dueOf, build, write, run };
