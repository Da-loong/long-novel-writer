#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError, countText } = require('./cap-utils');
const { validate } = require('./validate-project');
const { analyze: analyzeFormat } = require('./format-gate');

function argsOf(argv) {
  const args = { stage: 'pre', 'min-chars': '1200' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
    else if (!args.project) args.project = argv[i];
  }
  return args;
}

function contextManifest(file) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const raw = text.match(/<!-- context-manifest: (\{.*\}) -->/)?.[1];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function duplicateParagraphRatio(text) {
  const paragraphs = text.split(/\r?\n\s*\r?\n/).map((item) => item.replace(/\s+/g, '')).filter((item) => item.length >= 40);
  if (!paragraphs.length) return 0;
  return (paragraphs.length - new Set(paragraphs).size) / paragraphs.length;
}

function beatCells(row) {
  return row.split('|').slice(1, -1).map((cell) => cell.trim());
}

function gate(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  const stage = options.stage || 'pre';
  if (!['pre', 'post'].includes(stage)) throw new CliError('INVALID_STAGE', 'stage 必须为 pre 或 post', { stage });
  const validation = validate(project);
  const stateFile = path.join(project, 'state', 'project-state.json');
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { updated_through: -1 };
  const target = Number.parseInt(options.chapter || String(stage === 'pre' ? Number(state.updated_through || 0) + 1 : validation.latest_chapter), 10);
  if (!Number.isFinite(target) || target <= 0) throw new CliError('INVALID_CHAPTER', 'chapter 必须为正整数', { chapter: options.chapter });
  const errors = [];
  const warnings = [];
  const add = (severity, code, file, detail) => (severity === 'error' ? errors : warnings).push({ severity, code, file, detail });
  for (const item of validation.errors) add('error', item.code, item.file, item.detail);
  for (const item of validation.warnings) add('warning', item.code, item.file, item.detail);

  if (stage === 'pre') {
    const expected = Number(state.updated_through || 0) + 1;
    if (target !== expected) add('error', 'NEXT_CHAPTER_MISMATCH', 'state/project-state.json', `expected ${expected}, got ${target}`);
    const manifest = contextManifest(path.join(project, 'state', 'context-pack.md'));
    if (!manifest) add('error', 'CONTEXT_PACK_MISSING', 'state/context-pack.md', `run context-pack.js --chapter ${target} before drafting; chapter 1 uses settings/ and outline/ and does not require previous manuscript`);
    else {
      if (manifest.target_chapter !== target) add('error', 'CONTEXT_TARGET_MISMATCH', 'state/context-pack.md', `expected ${target}, got ${manifest.target_chapter}`);
      if (manifest.state_updated_through !== Number(state.updated_through || 0)) add('error', 'CONTEXT_STALE', 'state/context-pack.md', 'project state changed after context pack generation');
    }
    const beatsPath = path.join(project, 'outline', 'chapter-beats.md');
    const beats = fs.existsSync(beatsPath) ? fs.readFileSync(beatsPath, 'utf8') : '';
    const row = beats.split(/\r?\n/).find((line) => new RegExp(`^\\|\\s*0*${target}\\s*\\|`).test(line));
    if (!row) add('error', 'CHAPTER_BEAT_MISSING', 'outline/chapter-beats.md', `missing row for chapter ${target}`);
    else {
      const cells = beatCells(row);
      if (cells.length !== 9) add('error', 'CHAPTER_BEAT_COLUMN_COUNT', 'outline/chapter-beats.md', `chapter ${target} has ${cells.length} columns; expected 9 and no pipe characters inside cells`);
      else if (cells.slice(1).some((cell) => !cell)) add('error', 'CHAPTER_BEAT_INCOMPLETE', 'outline/chapter-beats.md', `chapter ${target} has empty fields`);
    }
    for (const name of ['settings/story-bible.md', 'settings/reader-contract.md']) {
      const text = fs.existsSync(path.join(project, name)) ? fs.readFileSync(path.join(project, name), 'utf8') : '';
      if (/待首次策划填写/.test(text)) add('error', 'CORE_SETTING_PENDING', name, 'replace initializer prompts with confirmed content or explicit unknowns');
    }
  } else {
    const pattern = new RegExp(`^ch-${String(target).padStart(4, '0')}-.+\\.md$`, 'i');
    const manuscript = path.join(project, 'manuscript');
    const chapterName = fs.existsSync(manuscript) ? fs.readdirSync(manuscript).find((name) => pattern.test(name)) : null;
    if (!chapterName) add('error', 'CHAPTER_FILE_MISSING', 'manuscript', `chapter ${target}`);
    else {
      const relative = `manuscript/${chapterName}`;
      const manuscriptFile = path.join(manuscript, chapterName);
      const text = fs.readFileSync(manuscriptFile, 'utf8');
      const counts = countText(text);
      const minimum = Number.parseInt(options['min-chars'] || '1200', 10);
      const maximum = options['max-chars'] === undefined ? null : Number.parseInt(options['max-chars'], 10);
      if (!Number.isFinite(minimum) || minimum <= 0) throw new CliError('INVALID_MIN_CHARS', 'min-chars 必须为正整数', { value: options['min-chars'] });
      if (maximum !== null && (!Number.isFinite(maximum) || maximum <= 0)) throw new CliError('INVALID_MAX_CHARS', 'max-chars 必须为正整数', { value: options['max-chars'] });
      if (maximum !== null && maximum < minimum) throw new CliError('INVALID_CHAR_RANGE', 'max-chars 不得小于 min-chars', { minimum, maximum });
      if (counts.chinese_chars < minimum) add('error', 'CHAPTER_TOO_SHORT', relative, `${counts.chinese_chars} < ${minimum} Chinese characters`);
      if (maximum !== null && counts.chinese_chars > maximum) add('error', 'CHAPTER_TOO_LONG', relative, `${counts.chinese_chars} > ${maximum} Chinese characters`);
      if (/(?:TODO|TBD|待补|此处略|若干字|省略|占位|待续)/i.test(text)) add('error', 'PLACEHOLDER_CONTENT', relative, 'draft contains placeholder content');
      const duplicateRatio = duplicateParagraphRatio(text);
      if (duplicateRatio > 0.12) add('error', 'DUPLICATE_PARAGRAPHS', relative, `ratio=${duplicateRatio.toFixed(3)}`);
      const format = analyzeFormat(manuscriptFile, text, options);
      for (const item of format.errors) add('error', item.code, relative, item.detail);
      for (const item of format.warnings) add('warning', item.code, relative, item.detail);
    }
    if (Number(state.updated_through) !== target) add('error', 'STATE_NOT_COMMITTED', 'state/project-state.json', `updated_through=${state.updated_through}, target=${target}`);
  }
  return { ok: errors.length === 0, schema_version: '1.0', stage, project, chapter: target, errors, warnings, evidence: { project_validation_ok: validation.ok, latest_chapter: validation.latest_chapter, state_updated_through: state.updated_through } };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project) throw new CliError('USAGE', '用法: node chapter-gate.js <项目目录> --stage pre|post --chapter N [--min-chars 1200] [--max-chars 3500]');
  const report = gate(args.project, args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 3;
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'chapter-gate'); }
}

module.exports = { argsOf, contextManifest, duplicateParagraphRatio, beatCells, gate, run };
