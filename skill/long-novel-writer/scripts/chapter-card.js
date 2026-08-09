#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const CARD_DIR = 'state/chapter-cards';
const REQUIRED_BEAT_FIELDS = ['pov', 'goal', 'obstacle', 'turn', 'cost', 'information', 'emotion', 'hook'];
const REQUIRED_READER_EXPERIENCE_FIELDS = ['reader_question', 'visible_payoff', 'net_change', 'end_pull'];
const CHAPTER_OBLIGATION_FIELDS = ['goal', 'obstacle', 'turn', 'cost', 'information', 'emotion', 'hook'];

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

function qualityGuidanceOf(project, chapter) {
  const source = 'state/quality-guidance.json';
  const text = readText(project, source);
  if (!text) return { source, target_chapter: null, weakest_dimension: null, trend: 'insufficient_data', recommendations: [], warnings: [] };
  try {
    const data = JSON.parse(text);
    return {
      source,
      target_chapter: Number(data.target_chapter || 0) || null,
      weakest_dimension: data.weakest_dimension || null,
      trend: String(data.trend || 'insufficient_data'),
      recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
    };
  } catch (error) {
    throw new CliError('CHAPTER_CARD_QUALITY_GUIDANCE_INVALID', 'Quality guidance JSON is invalid', { source, message: error.message });
  }
}

function repairDebtGuidanceOf(project, chapter) {
  const source = 'state/repair-debt-guidance.json';
  const text = readText(project, source);
  if (!text) return { source, target_chapter: null, primary_root_cause: 'unknown', recommendation: '', unresolved_chapters: [] };
  try {
    const data = JSON.parse(text);
    return {
      source,
      target_chapter: Number(data.target_chapter || 0) || null,
      primary_root_cause: String(data.primary_root_cause || 'unknown'),
      recommendation: String(data.recommendation || ''),
      unresolved_chapters: Array.isArray(data.unresolved_chapters) ? data.unresolved_chapters : [],
    };
  } catch (error) {
    throw new CliError('CHAPTER_CARD_REPAIR_DEBT_GUIDANCE_INVALID', 'Repair debt guidance JSON is invalid', { source, message: error.message });
  }
}

function repairLessonsOf(project, chapter) {
  const source = 'state/repair-lessons.json';
  const text = readText(project, source);
  if (!text) return { source, target_chapter: null, lessons: [], warnings: [] };
  try {
    const data = JSON.parse(text);
    return { source, target_chapter: Number(data.target_chapter || 0) || null, lessons: Array.isArray(data.lessons) ? data.lessons : [], warnings: Array.isArray(data.warnings) ? data.warnings : [] };
  } catch (error) {
    throw new CliError('CHAPTER_CARD_REPAIR_LESSONS_INVALID', 'Repair lessons JSON is invalid', { source, message: error.message });
  }
}

function plotUnitOf(project, chapter) {
  const source = 'state/plot-unit-window.json';
  const text = readText(project, source);
  if (!text) return { source, target_chapter: null, enabled: false, unit: null, warnings: [] };
  try {
    const data = JSON.parse(text);
    return { source, target_chapter: Number(data.target_chapter || 0) || null, enabled: data.enabled === true, unit: data.unit && typeof data.unit === 'object' ? data.unit : null, warnings: Array.isArray(data.warnings) ? data.warnings : [] };
  } catch (error) {
    throw new CliError('CHAPTER_CARD_PLOT_UNIT_INVALID', 'Plot-unit window JSON is invalid', { source, message: error.message });
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

// A scene can contain a generic goal, turn, payoff, and hook while still
// evading the *assigned* beat. Keep the chapter-specific promises separate
// from the generic scene-shape checks so an independent reader can attest to
// both with literal prose evidence.
function chapterObligationsOf(beat) {
  if (!beat) return [];
  return [
    { id: 'beat_goal', field: 'goal', phase: 'entry-pressure', obligation: `POV ${beat.pov} visibly pursues this chapter goal: ${beat.goal}` },
    { id: 'beat_obstacle', field: 'obstacle', phase: 'entry-pressure', obligation: `The assigned obstacle visibly resists that goal: ${beat.obstacle}` },
    { id: 'beat_turn', field: 'turn', phase: 'escalation-choice', obligation: `The chapter reaches this decisive turn, choice, or reversal: ${beat.turn}` },
    { id: 'beat_cost', field: 'cost', phase: 'escalation-choice', obligation: `That turn creates this concrete cost or consequence: ${beat.cost}` },
    { id: 'beat_information', field: 'information', phase: 'payoff-next-pull', obligation: `The reader receives this on-page answer, result, or new fact: ${beat.information}` },
    { id: 'beat_emotion', field: 'emotion', phase: 'payoff-next-pull', obligation: `The POV's emotional movement is visible in action, reaction, or choice: ${beat.emotion}` },
    { id: 'beat_hook', field: 'hook', phase: 'payoff-next-pull', obligation: `The ending leaves this specific next-reading pull: ${beat.hook}` },
  ];
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
  const qualityGuidance = qualityGuidanceOf(project, chapter);
  const repairDebtGuidance = repairDebtGuidanceOf(project, chapter);
  const repairLessons = repairLessonsOf(project, chapter);
  const plotUnit = plotUnitOf(project, chapter);
  const sources = [
    'settings/author-intent.md', 'state/current-focus.md', 'settings/reader-contract.md', 'settings/platform-contract.md',
    'outline/chapter-beats.md', 'state/current-state.md', 'state/character-state.md', 'state/character-contracts.json', 'state/style-contract.json', 'state/unresolved-hooks.md', foreshadowing.source, resourceWindow.source, qualityGuidance.source, repairDebtGuidance.source, repairLessons.source, plotUnit.source,
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
    chapter_obligations: chapterObligationsOf(beat),
    reader_experience_contract: readerExperienceOf(beat),
    foreshadowing_due: foreshadowing.due,
    resource_window: resourceWindow,
    quality_guidance: qualityGuidance,
    repair_debt_guidance: repairDebtGuidance,
    repair_lessons: repairLessons,
    plot_unit: plotUnit,
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
  const obligations = Array.isArray(card.chapter_obligations) ? card.chapter_obligations : [];
  const obligationIds = new Set(obligations.map((item) => String(item?.id || '').trim()));
  for (const field of CHAPTER_OBLIGATION_FIELDS) {
    const id = `beat_${field}`;
    const obligation = obligations.find((item) => item?.id === id);
    if (!obligation || !String(obligation.obligation || '').trim() || !String(obligation.phase || '').trim()) errors.push({ code: 'CHAPTER_CARD_OBLIGATION_MISSING', id, field });
  }
  if (obligationIds.size !== obligations.length) errors.push({ code: 'CHAPTER_CARD_OBLIGATION_DUPLICATE_ID' });
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

module.exports = { CARD_DIR, REQUIRED_BEAT_FIELDS, REQUIRED_READER_EXPERIENCE_FIELDS, CHAPTER_OBLIGATION_FIELDS, argsOf, cellsOf, tableRows, beatOf, knowledgeOf, dueForeshadowing, resourceWindowOf, qualityGuidanceOf, repairDebtGuidanceOf, repairLessonsOf, plotUnitOf, sourceHashes, cardFile, readerExperienceOf, chapterObligationsOf, build, write, validate, run };
