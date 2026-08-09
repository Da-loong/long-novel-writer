#!/usr/bin/env node
'use strict';

/*
 * Turns recurring repair debt into a small, deduplicated next-chapter lesson
 * set. One failed draft is not a lesson: a key must recur across accepted or
 * unresolved chapters before it can influence future drafting.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');
const { LEDGER_FILE } = require('./repair-debt-ledger');

const OUTPUT = 'state/repair-lessons.json';
const MIN_CHAPTERS = 2;
const MAX_LESSONS = 4;

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
function sha256(value) { return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex'); }
function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}
function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (_) { return fallback; }
}
function focusFor(key) {
  const named = {
    'scene:goal': 'Open with the POV visibly pursuing the assigned goal before background explanation.',
    'scene:obstacle': 'Put the assigned obstacle on page early and make it resist the POV action.',
    'scene:turn': 'Make the assigned turn a visible decision or reversal, not a narrated summary.',
    'scene:payoff': 'Land a concrete result or answer on page before the ending hook.',
    'scene:hook': 'End on a specific changed question, choice, or cost rather than generic danger.',
    'editorial:causal_chain': 'Keep action, response, consequence, and next choice in visible cause-and-effect order.',
    'editorial:outline_delivery': 'Deliver the assigned chapter beat through scenes; do not replace it with explanation.',
    'editorial:next_read_boundary': 'Make the final pull actionable and specific to this chapter change.',
  };
  if (named[key]) return named[key];
  if (key.startsWith('obligation:')) return `Give the failed chapter obligation ${key.slice('obligation:'.length)} literal on-page proof.`;
  if (key.startsWith('score:')) return `Repair the repeatedly weak reader dimension ${key.slice('score:'.length)} through the assigned scene.`;
  if (key.startsWith('style:')) return `Make the adopted style signal ${key.slice('style:'.length)} visible in prose and verify it with literal evidence.`;
  if (key.startsWith('character:')) return `Let the failed character contract ${key.slice('character:'.length)} govern action, knowledge, and voice on page.`;
  if (key.startsWith('feedback:')) return `Apply the recurring feedback rule ${key.slice('feedback:'.length)} with literal scene evidence.`;
  return `Address the recurring repair debt ${key} directly before making unrelated prose changes.`;
}
function lessonsOf(ledger) {
  const occurrences = new Map();
  for (const entry of Array.isArray(ledger?.entries) ? ledger.entries : []) {
    const chapter = Number(entry?.chapter);
    if (!Number.isInteger(chapter) || chapter <= 0) continue;
    for (const key of [...new Set([...(entry.initial_debt_keys || []), ...(entry.repeated_debt_keys || [])].map(String).filter(Boolean))]) {
      const chapters = occurrences.get(key) || new Set(); chapters.add(chapter); occurrences.set(key, chapters);
    }
  }
  return [...occurrences.entries()]
    .map(([key, chapters]) => ({ key, chapters: [...chapters].sort((a, b) => a - b), recurrence: chapters.size, focus: focusFor(key) }))
    .filter((item) => item.recurrence >= MIN_CHAPTERS)
    .sort((left, right) => right.recurrence - left.recurrence || left.key.localeCompare(right.key))
    .slice(0, MAX_LESSONS)
    .map((item) => ({ id: `repair:${item.key}`, ...item, status: 'active' }));
}
function build(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const state = readJson(path.join(project, 'state', 'project-state.json'), {});
  const targetChapter = Number.parseInt(options.chapter || String(Number(state.updated_through || 0) + 1), 10);
  if (!Number.isInteger(targetChapter) || targetChapter <= 0) throw new CliError('INVALID_CHAPTER', 'chapter must be a positive integer', { chapter: options.chapter });
  const sourceFile = path.join(project, LEDGER_FILE);
  const sourceText = fs.existsSync(sourceFile) ? fs.readFileSync(sourceFile, 'utf8').replace(/^\uFEFF/, '') : '';
  const lessons = lessonsOf(readJson(sourceFile, { entries: [] }));
  const data = {
    schema_version: '1.0', generated_at: new Date().toISOString(), target_chapter: targetChapter,
    source: LEDGER_FILE, source_sha256: sourceText ? sha256(sourceText) : null, min_chapters: MIN_CHAPTERS,
    lessons, warnings: sourceText ? [] : [{ code: 'REPAIR_DEBT_LEDGER_MISSING', source: LEDGER_FILE }],
    rule: 'Lessons are evidence-derived recurring repair constraints. They cannot override the chapter card, canon, reader/platform contract, or literal-evidence gates.',
  };
  return { project, data };
}
function write(projectInput, options = {}) { const result = build(projectInput, options); atomicWrite(path.join(result.project, OUTPUT), `${JSON.stringify(result.data, null, 2)}\n`); return { ...result, output: OUTPUT }; }
function inspect(projectInput) { const project = projectOf(projectInput); const data = readJson(path.join(project, OUTPUT), null); return { ok: Boolean(data), project, file: OUTPUT, target_chapter: data?.target_chapter || null, lessons: data?.lessons || [], warnings: data?.warnings || [] }; }
function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.command || !args.project || !['update', 'audit'].includes(args.command)) throw new CliError('USAGE', 'Usage: node repair-lessons.js update|audit <PROJECT> [--chapter N]');
  const result = args.command === 'update' ? write(args.project, args) : inspect(args.project);
  process.stdout.write(`${JSON.stringify(args.command === 'update' ? { ok: true, project: result.project, output: result.output, lessons: result.data.lessons, warnings: result.data.warnings } : result, null, 2)}\n`);
  return result;
}
if (require.main === module) { try { run(); } catch (error) { process.exitCode = emitError(error, 'repair-lessons'); } }
module.exports = { OUTPUT, MIN_CHAPTERS, MAX_LESSONS, argsOf, sha256, projectOf, readJson, focusFor, lessonsOf, build, write, inspect, run };
