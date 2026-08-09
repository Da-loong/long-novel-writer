#!/usr/bin/env node
'use strict';

/* Derive every mutable continuity view from the literal, hash-bound fact ledger. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const FACT_DIR = 'state/fact-ledger';
const INDEX = `${FACT_DIR}/index.json`;
const OUTPUT = 'state/fact-projections.json';
const VIEWS = ['state/current-state.md', 'state/character-state.md', 'state/timeline.md', 'state/unresolved-hooks.md'];

function argsOf(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { const v = argv[i]; if (v.startsWith('--')) { const n = argv[i + 1]; out[v.slice(2)] = n && !n.startsWith('--') ? n : true; if (out[v.slice(2)] !== true) i++; } else if (!out.command) out.command = v; else if (!out.project) out.project = v; } return out; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function projectOf(input) { const project = path.resolve(input || ''); if (!input || !fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project }); return project; }
function readJson(file, fallback = null) { if (!fs.existsSync(file)) return fallback; try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (error) { throw new CliError('FACT_LEDGER_INVALID', 'Fact ledger JSON parse failed', { file, message: error.message }); } }
function escapeCell(value) { return String(value || '').replace(/[|\r\n]+/g, ' ').trim(); }
function ledgers(project) {
  const dir = path.join(project, FACT_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => /^ch-\d{4}\.json$/i.test(name)).sort().map((name) => {
    const value = readJson(path.join(dir, name));
    if (!value || !Number.isInteger(Number(value.chapter)) || !Array.isArray(value.facts)) throw new CliError('FACT_LEDGER_INVALID', 'Each fact ledger needs chapter and facts', { file: `${FACT_DIR}/${name}` });
    return { relative: `${FACT_DIR}/${name}`, sha256: sha256(fs.readFileSync(path.join(dir, name), 'utf8')), ...value };
  }).sort((a, b) => Number(a.chapter) - Number(b.chapter));
}
function build(projectInput) {
  const project = projectOf(projectInput); const entries = ledgers(project); const facts = entries.flatMap((entry) => entry.facts.map((fact, index) => ({ ...fact, chapter: Number(entry.chapter), ledger: entry.relative, index })));
  const activeHooks = new Map();
  for (const fact of facts) { if (fact.kind === 'hook_open') activeHooks.set(`${fact.subject}\0${fact.claim}`, fact); if (fact.kind === 'hook_closed') activeHooks.delete(`${fact.subject}\0${fact.claim}`); }
  const characters = facts.filter((fact) => ['character_state', 'relationship'].includes(fact.kind));
  const timeline = facts.filter((fact) => ['event', 'timeline', 'location'].includes(fact.kind));
  const latest = entries.at(-1)?.chapter || 0;
  const index = { schema_version: '1.0', generated_at: new Date().toISOString(), entries: entries.map((entry) => ({ chapter: Number(entry.chapter), ledger: entry.relative, sha256: entry.sha256, facts: entry.facts.length })), latest_chapter: latest, fact_count: facts.length };
  const projection = { schema_version: '1.0', generated_at: index.generated_at, source: INDEX, source_sha256: sha256(JSON.stringify(index.entries)), latest_chapter: latest, current: { summaries: entries.slice(-3).map((entry) => ({ chapter: Number(entry.chapter), summary: entry.summary, ledger: entry.relative })) }, characters: characters.slice(-80), timeline: timeline.slice(-120), unresolved_hooks: [...activeHooks.values()], rule: 'Derived projection only. Make continuity changes by appending a validated chapter fact ledger, never by editing this view.' };
  const current = ['# Current state (derived)', '', `updated_through: ${latest}`, '', ...projection.current.summaries.map((item) => `- ch ${item.chapter}: ${item.summary} (${item.ledger})`)].join('\n') + '\n';
  const character = ['# Character state (derived)', '', '| Chapter | Subject | Fact | Evidence |', '|---:|---|---|---|', ...projection.characters.map((item) => `| ${item.chapter} | ${escapeCell(item.subject)} | ${escapeCell(item.claim)} | ${escapeCell(item.evidence)} |`)].join('\n') + '\n';
  const timelineView = ['# Timeline (derived)', '', '| Chapter | Kind | Subject | Event | Evidence |', '|---:|---|---|---|---|', ...projection.timeline.map((item) => `| ${item.chapter} | ${item.kind} | ${escapeCell(item.subject)} | ${escapeCell(item.claim)} | ${escapeCell(item.evidence)} |`)].join('\n') + '\n';
  const hooks = ['# Unresolved hooks (derived)', '', '| Opened | Subject | Question / promise | Evidence |', '|---:|---|---|---|', ...projection.unresolved_hooks.map((item) => `| ${item.chapter} | ${escapeCell(item.subject)} | ${escapeCell(item.claim)} | ${escapeCell(item.evidence)} |`)].join('\n') + '\n';
  return { project, index, projection, views: { [VIEWS[0]]: current, [VIEWS[1]]: character, [VIEWS[2]]: timelineView, [VIEWS[3]]: hooks } };
}
function write(projectInput) { const result = build(projectInput); atomicWrite(path.join(result.project, INDEX), `${JSON.stringify(result.index, null, 2)}\n`); atomicWrite(path.join(result.project, OUTPUT), `${JSON.stringify(result.projection, null, 2)}\n`); for (const [relative, text] of Object.entries(result.views)) atomicWrite(path.join(result.project, relative), text); return { ok: true, project: result.project, output: OUTPUT, index: INDEX, latest_chapter: result.index.latest_chapter, fact_count: result.index.fact_count, views: Object.keys(result.views) }; }
function run(argv = process.argv.slice(2)) { const args = argsOf(argv); if (args.command !== 'build' || !args.project) throw new CliError('USAGE', 'Usage: node fact-projections.js build <PROJECT>'); const result = write(args.project); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return result; }
if (require.main === module) { try { run(); } catch (error) { process.exitCode = emitError(error, 'fact-projections'); } }
module.exports = { FACT_DIR, INDEX, OUTPUT, VIEWS, argsOf, ledgers, build, write, run };
