#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite, countText } = require('./cap-utils');

const STATE_FILES = ['state/current-state.md', 'state/character-state.md', 'state/timeline.md', 'state/unresolved-hooks.md', 'state/current-focus.md'];
const MEMORY_DIR = 'state/chapter-memory';

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) args[value.slice(2)] = argv[index + 1]?.startsWith('--') ? true : argv[++index];
    else if (!args.command) args.command = value;
    else if (!args.project) args.project = value;
  }
  return args;
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function relative(project, file) {
  return path.relative(project, file).replace(/\\/g, '/');
}

function chapterFile(project, chapter) {
  const directory = path.join(project, 'manuscript');
  const pattern = new RegExp(`^ch-${String(chapter).padStart(4, '0')}-.*\\.md$`, 'i');
  const name = fs.existsSync(directory) ? fs.readdirSync(directory).find((item) => pattern.test(item)) : null;
  return name ? path.join(directory, name) : null;
}

function bodyOf(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/^#{1,6}\s+[^\r\n]*\r?\n?/, '').trim();
}

function clip(value, limit = 480) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, Math.max(1, limit - 1))}?`;
}

function capsuleOf(text) {
  const paragraphs = bodyOf(text).split(/\r?\n\s*\r?\n/).map((item) => item.trim()).filter(Boolean);
  return {
    opening: clip(paragraphs[0] || ''),
    turning: clip(paragraphs[Math.floor(paragraphs.length / 2)] || paragraphs[0] || ''),
    ending: clip(paragraphs.at(-1) || ''),
  };
}

function memoryFile(project, chapter) {
  return path.join(project, MEMORY_DIR, `ch-${String(chapter).padStart(4, '0')}.json`);
}

function capture(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  const chapter = Number.parseInt(options.chapter, 10);
  if (!Number.isFinite(chapter) || chapter <= 0) throw new CliError('INVALID_CHAPTER', 'Chapter must be a positive integer', { chapter: options.chapter });
  const manuscript = chapterFile(project, chapter);
  if (!manuscript) throw new CliError('MEMORY_MANUSCRIPT_MISSING', 'Chapter manuscript is missing', { project, chapter });
  const text = fs.readFileSync(manuscript, 'utf8').replace(/^\uFEFF/, '');
  const snapshots = STATE_FILES.filter((name) => fs.existsSync(path.join(project, name))).map((name) => {
    const full = path.join(project, name);
    const stateText = fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
    return { path: name, sha256: digest(stateText), excerpt: clip(stateText, 360) };
  });
  const memory = {
    schema_version: '1.0', chapter, created_at: new Date().toISOString(),
    manuscript: { path: relative(project, manuscript), sha256: digest(text), chinese_chars: countText(text).chinese_chars },
    capsule: capsuleOf(text), state_after: snapshots,
  };
  const output = memoryFile(project, chapter);
  atomicWrite(output, `${JSON.stringify(memory, null, 2)}\n`);
  return { ...memory, output, relative_output: relative(project, output) };
}

function read(projectInput, chapter) {
  const project = path.resolve(projectInput);
  const file = memoryFile(project, chapter);
  if (!fs.existsSync(file)) throw new CliError('MEMORY_MISSING', 'Chapter memory is missing', { chapter, file });
  try { return { memory: JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), file, project }; }
  catch (error) { throw new CliError('MEMORY_JSON_INVALID', 'Chapter memory JSON is invalid', { file, message: error.message }); }
}

function validate(projectInput, options = {}) {
  const chapter = Number.parseInt(options.chapter, 10);
  if (!Number.isFinite(chapter) || chapter <= 0) throw new CliError('INVALID_CHAPTER', 'Chapter must be a positive integer', { chapter: options.chapter });
  const { project, memory, file } = read(projectInput, chapter);
  const errors = [];
  if (Number(memory.chapter) !== chapter) errors.push({ code: 'MEMORY_CHAPTER_MISMATCH', expected: chapter, actual: memory.chapter });
  const manuscript = path.join(project, memory.manuscript?.path || '');
  if (!memory.manuscript?.path || !fs.existsSync(manuscript)) errors.push({ code: 'MEMORY_MANUSCRIPT_MISSING', path: memory.manuscript?.path || null });
  else if (digest(fs.readFileSync(manuscript, 'utf8').replace(/^\uFEFF/, '')) !== memory.manuscript.sha256) errors.push({ code: 'MEMORY_MANUSCRIPT_HASH_MISMATCH', path: memory.manuscript.path });
  for (const field of ['opening', 'turning', 'ending']) if (!String(memory.capsule?.[field] || '').trim()) errors.push({ code: 'MEMORY_CAPSULE_INCOMPLETE', field });
  return { ok: errors.length === 0, chapter, file, errors, memory };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.command || !args.project || !['capture', 'validate'].includes(args.command)) throw new CliError('USAGE', 'Usage: node chapter-memory.js capture|validate <project> --chapter N');
  const result = args.command === 'capture' ? capture(args.project, args) : validate(args.project, args);
  const report = args.command === 'capture'
    ? { ok: true, chapter: result.chapter, output: result.relative_output, manuscript: result.manuscript, capsule: result.capsule }
    : { ok: result.ok, chapter: result.chapter, file: result.file, errors: result.errors };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 3;
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'chapter-memory'); }
}

module.exports = { STATE_FILES, MEMORY_DIR, argsOf, digest, chapterFile, bodyOf, clip, capsuleOf, memoryFile, capture, read, validate, run };
