#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError } = require('./cap-utils');

const REQUIRED = [
  'settings/story-bible.md', 'settings/characters.md', 'settings/relations.md', 'settings/reader-contract.md', 'settings/style-guide.md',
  'outline/master-outline.md', 'outline/chapter-beats.md', 'outline/foreshadowing-ledger.md',
  'state/project-state.json', 'state/current-state.md', 'state/character-state.md', 'state/timeline.md', 'state/unresolved-hooks.md',
];

const PLACEHOLDER_PATTERN = /(?:\[TODO\]|\bTBD\b|此处略|待首次策划填写)/i;
const CHAPTER_PATTERN = /^ch-\d{4}-.+\.md$/i;

function duplicates(text, pattern) {
  const counts = new Map();
  for (const match of text.matchAll(pattern)) counts.set(match[0], (counts.get(match[0]) || 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count }));
}

function validate(rootInput) {
  const root = path.resolve(rootInput);
  if (!fs.existsSync(root)) throw new CliError('PATH_NOT_FOUND', `项目不存在: ${root}`, { path: root });
  const errors = [];
  const warnings = [];
  const add = (severity, code, file, detail) => (severity === 'error' ? errors : warnings).push({ severity, code, file, detail });
  for (const name of REQUIRED) if (!fs.existsSync(path.join(root, name))) add('error', 'MISSING_REQUIRED_FILE', name, 'required project artifact');

  let state = null;
  const statePath = path.join(root, 'state', 'project-state.json');
  if (fs.existsSync(statePath)) {
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (error) { add('error', 'INVALID_STATE_JSON', 'state/project-state.json', error.message); }
  }
  const manuscript = path.join(root, 'manuscript');
  const manuscriptEntries = fs.existsSync(manuscript) ? fs.readdirSync(manuscript) : [];
  const chapterFiles = manuscriptEntries.filter((name) => CHAPTER_PATTERN.test(name)).sort();
  for (const name of manuscriptEntries.filter((item) => /^ch-/i.test(item) && /\.md$/i.test(item) && !CHAPTER_PATTERN.test(item))) {
    add('error', 'INVALID_CHAPTER_FILENAME', `manuscript/${name}`, 'expected ch-XXXX-title.md with a four-digit chapter number, for example ch-0001-opening.md');
  }
  const chapterNumbers = chapterFiles.map((name) => Number.parseInt(name.slice(3, 7), 10));
  for (let expected = 1; expected <= (chapterNumbers.at(-1) || 0); expected++) if (!chapterNumbers.includes(expected)) add('error', 'CHAPTER_GAP', 'manuscript', `missing chapter ${expected}`);
  if (new Set(chapterNumbers).size !== chapterNumbers.length) add('error', 'DUPLICATE_CHAPTER_NUMBER', 'manuscript', 'chapter numbers must be unique');
  const latest = chapterNumbers.at(-1) || 0;
  if (state && state.updated_through !== latest) add('error', 'STATE_CHAPTER_MISMATCH', 'state/project-state.json', `updated_through=${state.updated_through}, latest_chapter=${latest}`);
  const currentState = path.join(root, 'state', 'current-state.md');
  if (fs.existsSync(currentState)) {
    const text = fs.readFileSync(currentState, 'utf8');
    const current = Number.parseInt(text.match(/^updated_through:\s*(\d+)/m)?.[1] || '-1', 10);
    if (current !== latest) add('error', 'CURRENT_STATE_MISMATCH', 'state/current-state.md', `updated_through=${current}, latest_chapter=${latest}`);
  }

  for (const name of REQUIRED.filter((item) => fs.existsSync(path.join(root, item)))) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    if (text.includes('\uFFFD')) add('error', 'ENCODING_DAMAGE', name, 'Unicode replacement character found');
    if (PLACEHOLDER_PATTERN.test(text)) add('warning', 'PLACEHOLDER', name, 'unresolved placeholder found');
  }
  const hookPath = path.join(root, 'state', 'unresolved-hooks.md');
  if (fs.existsSync(hookPath)) for (const item of duplicates(fs.readFileSync(hookPath, 'utf8'), /HOOK-[A-Z0-9_-]+/g)) add('error', 'DUPLICATE_HOOK_ID', 'state/unresolved-hooks.md', item);
  const fsPath = path.join(root, 'outline', 'foreshadowing-ledger.md');
  if (fs.existsSync(fsPath)) for (const item of duplicates(fs.readFileSync(fsPath, 'utf8'), /FS-[A-Z0-9_-]+/g)) add('error', 'DUPLICATE_FORESHADOW_ID', 'outline/foreshadowing-ledger.md', item);
  return { ok: errors.length === 0, schema_version: '1.0', project: root, chapters: chapterFiles.length, latest_chapter: latest, errors, warnings };
}

function run(argv = process.argv.slice(2)) {
  const root = argv[0];
  if (!root) throw new CliError('USAGE', '用法: node validate-project.js <项目目录>');
  const report = validate(root);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 2;
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'validate-project'); }
}

module.exports = { REQUIRED, PLACEHOLDER_PATTERN, CHAPTER_PATTERN, duplicates, validate, run };
