#!/usr/bin/env node
'use strict';

/* Compile explicit character agency, knowledge, and voice boundaries. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');
const { scopeOf } = require('./style-contract');

const SOURCE = 'evidence/derivations/character-contracts.md';
const OUTPUT = 'state/character-contracts.json';
const ACTIVE = /^(?:active|adopted|enabled|采纳|已采纳|启用)$/i;
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

function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function usable(value) { const text = String(value || '').trim(); return Boolean(text) && !PLACEHOLDER.test(text); }
function cellsOf(line) { return String(line || '').trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()); }
function normalHeader(value) { return String(value || '').trim().toLowerCase().replace(/[\s_\-/]+/g, ''); }
function invalid(message, details) { throw new CliError('CHARACTER_CONTRACT_INVALID', message, details); }

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function columnsOf(header) {
  const aliases = {
    name: ['name', '角色', '人物'],
    goal: ['goal', '目标'],
    pressure: ['pressuremotivation', '压力动机', '压力', '动机'],
    knowledge: ['knowledgeboundary', '已知信息边界', '信息边界', '已知信息'],
    voice: ['voiceaction', '口吻行动约束', '口吻约束', '口吻'],
    forbidden: ['forbidden', '禁止越界', '禁区'],
    scope: ['scope', '适用范围'],
    status: ['status', '状态'],
  };
  const normalized = header.map(normalHeader);
  return Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, normalized.findIndex((value) => names.includes(value))]));
}

function rowsOf(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim().startsWith('|')) continue;
    const columns = columnsOf(cellsOf(lines[index]));
    if (Object.values(columns).some((column) => column < 0)) continue;
    const rows = [];
    for (let cursor = index + 2; cursor < lines.length && lines[cursor].trim().startsWith('|'); cursor++) {
      const cells = cellsOf(lines[cursor]);
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      const field = (name) => cells[columns[name]] || '';
      rows.push({ row: cursor + 1, name: field('name'), goal: field('goal'), pressure: field('pressure'), knowledge_boundary: field('knowledge'), voice_and_action: field('voice'), forbidden: field('forbidden'), scope: field('scope'), status: field('status') });
    }
    return rows;
  }
  return [];
}

function compileData(text) {
  const warnings = [];
  const characters = [];
  const names = new Set();
  for (const row of rowsOf(text)) {
    if (!ACTIVE.test(String(row.status || '').trim())) continue;
    if (!usable(row.name)) { warnings.push({ code: 'CHARACTER_CONTRACT_NAME_EMPTY', row: row.row }); continue; }
    if (names.has(row.name)) { warnings.push({ code: 'CHARACTER_CONTRACT_DUPLICATE', row: row.row, name: row.name }); continue; }
    const required = ['goal', 'pressure', 'knowledge_boundary', 'voice_and_action', 'forbidden'];
    const missing = required.filter((key) => !usable(row[key]));
    const scope = scopeOf(row.scope);
    if (missing.length) { warnings.push({ code: 'CHARACTER_CONTRACT_FIELD_MISSING', row: row.row, name: row.name, fields: missing }); continue; }
    if (!scope) { warnings.push({ code: 'CHARACTER_CONTRACT_SCOPE_INVALID', row: row.row, name: row.name, scope: row.scope }); continue; }
    names.add(row.name);
    const key = `${row.name}\u0000${row.goal}\u0000${row.pressure}\u0000${row.knowledge_boundary}\u0000${row.voice_and_action}\u0000${row.forbidden}`;
    characters.push({ id: `character-${sha256(key).slice(0, 12)}`, source_row: row.row, name: row.name, goal: row.goal, pressure: row.pressure, knowledge_boundary: row.knowledge_boundary, voice_and_action: row.voice_and_action, forbidden: row.forbidden, scope, status: row.status, active: true });
  }
  return { characters, warnings };
}

function compile(projectInput) {
  const project = projectOf(projectInput);
  const source = path.join(project, SOURCE);
  if (!fs.existsSync(source)) throw new CliError('CHARACTER_CONTRACTS_MISSING', 'Missing character contract table', { source: SOURCE });
  const text = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
  const compiled = compileData(text);
  const payload = { schema_version: '1.0', generated_at: new Date().toISOString(), source: SOURCE, source_sha256: sha256(text), characters: compiled.characters, warnings: compiled.warnings };
  atomicWrite(path.join(project, OUTPUT), `${JSON.stringify(payload, null, 2)}\n`);
  return { ok: true, project, output: OUTPUT, character_count: payload.characters.length, warnings: payload.warnings, data: payload };
}

function read(projectInput) {
  const project = projectOf(projectInput);
  const file = path.join(project, OUTPUT);
  if (!fs.existsSync(file)) return { schema_version: '1.0', generated_at: null, source: SOURCE, source_sha256: null, characters: [], warnings: [] };
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { invalid('Character contracts JSON parse failed', { file: OUTPUT, message: error.message }); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.characters)) invalid('Character contracts require a characters array', { file: OUTPUT });
  return { ...value, characters: value.characters };
}

function due(projectInput, chapter, manuscript = '') {
  const target = Number.parseInt(chapter, 10);
  if (!Number.isInteger(target) || target <= 0) throw new CliError('INVALID_CHAPTER', 'chapter must be a positive integer', { chapter });
  const text = String(manuscript || '');
  return read(projectInput).characters.filter((character) => {
    const scope = character.scope || {};
    const inScope = scope.kind === 'all' || (scope.kind === 'opening' && target <= 3) || (scope.kind === 'chapter_range' && target >= Number(scope.start) && target <= Number(scope.end));
    return character.active === true && inScope && (!text || text.includes(character.name));
  });
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (args.command !== 'compile' || !args.project) throw new CliError('USAGE', 'Usage: node character-contract.js compile <PROJECT>');
  const report = compile(args.project);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'character-contract'); }
}

module.exports = { SOURCE, OUTPUT, ACTIVE, argsOf, sha256, usable, cellsOf, columnsOf, rowsOf, compileData, compile, read, due, run };
