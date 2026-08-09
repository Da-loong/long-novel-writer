#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const CARD_DIR = 'state/chapter-cards';
const REQUIRED_BEAT_FIELDS = ['pov', 'goal', 'obstacle', 'turn', 'cost', 'information', 'emotion', 'hook'];
const REQUIRED_READER_EXPERIENCE_FIELDS = ['reader_question', 'visible_payoff', 'net_change', 'end_pull'];

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) args[value.slice(2)] = true;
      else args[value.slice(2)] = argv[++index];
    } else if (!args.command) args.command = value;
    else if (!args.project) args.project = value;
  }
  return args;
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function normal(value) { return value.replace(/\\/g, '/'); }
function clip(value, limit = 720) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, Math.max(1, limit - 1))}…`;
}
function readText(project, relative) {
  const file = path.join(project, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') : '';
}
function cellsOf(line) { return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()); }
function tableRows(text) {
  return String(text || '').split(/\r?\n/).filter((line) => line.trim().startsWith('|')).map(cellsOf).filter((cells) => cells.length >= 2 && !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
}

function beatOf(project, chapter) {
  const source = 'outline/chapter-beats.md';
  const rows = tableRows(readText(project, source));
  const row = rows.find((cells) => Number.parseInt(cells[0], 10) === chapter);
  if (!row) return null;
  const [, pov = '', goal = '', obstacle = '', turn = '', cost = '', information = '', emotion = '', hook = ''] = row;
  return { source, pov, goal, obstacle, turn, cost, information, emotion, hook };
}

function knowledgeOf(project, pov) {
  const source = 'state/character-state.md';
  const rows = tableRows(readText(project, source));
  const headerIndex = rows.findIndex((cells) => cells.some((cell) => /(?:\u4eba\u7269|character|name)/i.test(cell)));
  if (headerIndex < 0) return { source, pov, known_information: '', matched: false };
  const headers = rows[headerIndex];
  const knownIndex = headers.findIndex((cell) => /(?:\u5df2\u77e5\u4fe1\u606f|known|knowledge)/i.test(cell));
  const row = rows.slice(headerIndex + 1).find((cells) => cells[0] === pov);
  return { source, pov, known_information: knownIndex >= 0 && row ? row[knownIndex] || '' : '', matched: Boolean(row) };
}

function dueForeshadowing(project, chapter) {
  const source = 'state/foreshadowing-index.json';
  const text = readText(project, source);
  if (!text) return { source, due: [] };
  try {
    const data = JSON.parse(text);
    return { source, due: (data.due || []).filter((item) => Number(item.chapter || chapter) === chapter || item.kind === 'overdue').map((item) => ({ id: item.id, kind: item.kind, content: item.content || '', deadline: item.deadline || null })) };
  } catch (error) {
    throw new CliError('CHAPTER_CARD_FORESHADOW_INDEX_INVALID', 'Foreshadowing index JSON is invalid', { source, message: error.message });
  }
}

function resourceWindowOf(project, chapter) {
  const source = 'state/resource-window.json';
  const text = readText(project, source);
  if (!text) return { source, target_chapter: null, resources: [], warnings: [] };
  try {
    const data = JSON.parse(text);
    return { source, target_chapter: Number(data.target_chapter || 0) || null, resources: Array.isArray(data.resources) ? data.resources : [], warnings: Array.isArray(data.warnings) ? data.warnings : [] };
  } catch (error) {
    throw new CliError('CHAPTER_CARD_RESOURCE_WINDOW_INVALID', 'Resource window JSON is invalid', { source, message: error.message });
  }
}

function sourceHashes(project, paths) {
  return paths.filter((relative) => fs.existsSync(path.join(project, relative))).map((relative) => ({ path: relative, sha256: sha256(readText(project, relative)) }));
}

function cardFile(project, chapter) { return path.join(project, CARD_DIR, `ch-${String(chapter).padStart(4, '0')}.json`); }

function readerExperienceOf(beat) {
  if (!beat) return null;
  return {
    reader_question: `${beat.pov}能否${beat.goal}，并应对${beat.obstacle}？`,
    visible_payoff: `让读者实际获得“${beat.information}”或“${beat.turn}”造成的明确结果；不可只把回报推迟到下一章。`,
    net_change: `章节结束时必须能看见由“${beat.turn}”带来的代价、资源、关系、认知或风险变化：${beat.cost}。`,
    end_pull: beat.hook,
  };
}

function build(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  if (!fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', `Project does not exist: ${project}`, { project });
  const chapter = Number.parseInt(options.chapter, 10);
  if (!Number.isFinite(chapter) || chapter <= 0) throw new CliError('INVALID_CHAPTER', 'Chapter must be a positive integer', { chapter: options.chapter });
  const beat = beatOf(project, chapter);
  const errors = [];
  const warnings = [];
  if (!beat) errors.push({ code: 'CHAPTER_CARD_BEAT_MISSING', chapter, source: 'outline/chapter-beats.md' });
  for (const field of REQUIRED_BEAT_FIELDS) if (beat && !String(beat[field] || '').trim()) errors.push({ code: 'CHAPTER_CARD_BEAT_FIELD_MISSING', chapter, field });
  const knowledge = knowledgeOf(project, beat?.pov || '');
  if (beat?.pov && !knowledge.matched) warnings.push({ code: 'CHAPTER_CARD_POV_STATE_UNMAPPED', chapter, pov: beat.pov, source: knowledge.source });
  const foreshadowing = dueForeshadowing(project, chapter);
  const resourceWindow = resourceWindowOf(project, chapter);
  const sources = [
    'settings/author-intent.md', 'state/current-focus.md', 'settings/reader-contract.md', 'settings/platform-contract.md',
    'outline/chapter-beats.md', 'state/current-state.md', 'state/character-state.md', 'state/character-contracts.json', 'state/style-contract.json', 'state/unresolved-hooks.md', foreshadowing.source, resourceWindow.source,
  ];
  const card = {
    schema_version: '1.0', generated_at: new Date().toISOString(), chapter, status: errors.length ? 'blocked' : 'ready',
    chapter_beat: beat,
    character_knowledge_boundary: {
      ...knowledge,
      rule: 'Treat only explicit project state and the context pack as available knowledge. Each character acts from their own goal, role, pressure, and information boundary.',
    },
    scene_contract: beat ? [
      { order: 1, function: 'entry-pressure', must_deliver: [beat.goal, beat.obstacle] },
      { order: 2, function: 'escalation-choice', must_deliver: [beat.turn, beat.cost] },
      { order: 3, function: 'payoff-next-pull', must_deliver: [beat.information, beat.emotion, beat.hook] },
    ] : [],
    reader_experience_contract: readerExperienceOf(beat),
    foreshadowing_due: foreshadowing.due,
    resource_window: resourceWindow,
    drafting_protocol: {
      draft_a: 'Deliver the beat through visible scene action and preserve the knowledge boundary.',
      draft_b: 'Repair causal, character, pacing, and information-boundary findings before final delivery.',
      draft_c: 'Repair Chinese readability, dialogue naturalness, and generic AI phrasing without changing canon or story facts.',
    },
    acceptance: beat ? [
      `POV pursues: ${beat.goal}`, `Pressure: ${beat.obstacle}`, `Turn and cost: ${beat.turn} / ${beat.cost}`,
      `Visible reader payoff: ${beat.information}`, `Ending pull: ${beat.hook}`,
    ] : [],
    source_hashes: sourceHashes(project, sources), errors, warnings,
  };
  return { project, chapter, card, errors, warnings };
}

function write(projectInput, options = {}) {
  const result = build(projectInput, options);
  const output = cardFile(result.project, result.chapter);
  atomicWrite(output, `${JSON.stringify(result.card, null, 2)}\n`);
  return { ...result, output, relative_output: normal(path.relative(result.project, output)) };
}

function validate(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  const chapter = Number.parseInt(options.chapter, 10);
  if (!Number.isFinite(chapter) || chapter <= 0) throw new CliError('INVALID_CHAPTER', 'Chapter must be a positive integer', { chapter: options.chapter });
  const file = cardFile(project, chapter);
  if (!fs.existsSync(file)) throw new CliError('CHAPTER_CARD_MISSING', 'Chapter card is missing', { chapter, file });
  let card;
  try { card = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { throw new CliError('CHAPTER_CARD_JSON_INVALID', 'Chapter card JSON is invalid', { file, message: error.message }); }
  const errors = [];
  if (Number(card.chapter) !== chapter) errors.push({ code: 'CHAPTER_CARD_NUMBER_MISMATCH', expected: chapter, actual: card.chapter });
  if (card.status !== 'ready') errors.push(...(card.errors || [{ code: 'CHAPTER_CARD_NOT_READY' }]));
  for (const field of REQUIRED_BEAT_FIELDS) if (!String(card.chapter_beat?.[field] || '').trim()) errors.push({ code: 'CHAPTER_CARD_BEAT_FIELD_MISSING', field });
  for (const field of REQUIRED_READER_EXPERIENCE_FIELDS) if (!String(card.reader_experience_contract?.[field] || '').trim()) errors.push({ code: 'CHAPTER_CARD_READER_EXPERIENCE_MISSING', field });
  return { ok: errors.length === 0, chapter, file, errors, card };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.command || !args.project || !['build', 'validate'].includes(args.command)) throw new CliError('USAGE', 'Usage: node chapter-card.js build|validate <project> --chapter N');
  const result = args.command === 'build' ? write(args.project, args) : validate(args.project, args);
  const report = args.command === 'build'
    ? { ok: result.errors.length === 0, chapter: result.chapter, output: result.relative_output, errors: result.errors, warnings: result.warnings }
    : { ok: result.ok, chapter: result.chapter, file: result.file, errors: result.errors };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 3;
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'chapter-card'); }
}

module.exports = { CARD_DIR, REQUIRED_BEAT_FIELDS, REQUIRED_READER_EXPERIENCE_FIELDS, argsOf, cellsOf, tableRows, beatOf, knowledgeOf, dueForeshadowing, resourceWindowOf, sourceHashes, cardFile, readerExperienceOf, build, write, validate, run };
