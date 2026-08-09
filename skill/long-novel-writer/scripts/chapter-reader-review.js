#!/usr/bin/env node
'use strict';

/*
 * Validates a cold-reader report before it can affect a chapter transaction.
 * The writing model supplies the judgement; this script makes its schema,
 * manuscript evidence, and release decision independently checkable.
 */
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const REQUIRED_SCORES = ['clarity', 'continuation', 'fanqie_fit', 'character_agency', 'payoff'];
const REQUIRED_SCENE_EVIDENCE = ['goal', 'obstacle', 'turn', 'payoff', 'hook'];
const VERDICTS = new Set(['pass', 'revise']);
const SEVERITIES = new Set(['critical', 'warning']);
const SCENE_STATUSES = new Set(['present', 'missing']);

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
function chapterId(chapter) { return String(Number(chapter)).padStart(4, '0'); }

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function manuscriptOf(project, chapter) {
  const directory = path.join(project, 'manuscript');
  const expression = new RegExp(`^ch-${chapterId(chapter)}-.+\\.md$`, 'i');
  const matches = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => expression.test(name)).sort() : [];
  if (matches.length !== 1) throw new CliError('CHAPTER_ARTIFACT_SHAPE', `Expected exactly one manuscript for chapter ${chapter}`, { chapter: Number(chapter), files: matches });
  const file = path.join(directory, matches[0]);
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const body = text.replace(/^#{1,6}[^\n]*(?:\r?\n|$)/, '').trim();
  if (!body) throw new CliError('CHAPTER_EMPTY', `Chapter ${chapter} has no manuscript body`, { chapter: Number(chapter), file: normal(path.relative(project, file)) });
  return { file, relative: normal(path.relative(project, file)), text, body };
}

function reviewPath(project, chapter, file) {
  const fallback = `analysis/chapter-reader-review-ch${chapterId(chapter)}.json`;
  const relative = normal(file || fallback);
  const absolute = path.resolve(project, relative);
  const outside = !relative || relative.startsWith('../') || path.isAbsolute(relative) || path.relative(project, absolute).startsWith('..');
  if (outside) throw new CliError('PATH_ESCAPE', 'Reader review must stay inside project', { file: relative });
  return { absolute, relative };
}

function invalid(message, details) { throw new CliError('CHAPTER_READER_REVIEW_INVALID', message, details); }

function validateSceneEvidence(value, manuscript, chapter) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Reader review scene_evidence object is required', { chapter });
  const result = {};
  for (const key of REQUIRED_SCENE_EVIDENCE) {
    const item = value[key];
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid(`Reader review scene_evidence.${key} is required`, { chapter, key });
    const status = String(item.status || '').trim();
    const evidence = String(item.evidence || '').trim();
    const note = String(item.note || '').trim();
    if (!SCENE_STATUSES.has(status)) invalid(`Reader review scene_evidence.${key}.status is invalid`, { chapter, key, status });
    if (status === 'present' && (!evidence || !manuscript.body.includes(evidence))) invalid(`Reader review scene_evidence.${key} must quote the manuscript`, { chapter, key, evidence });
    if (status === 'missing' && !note) invalid(`Reader review scene_evidence.${key}.note is required when missing`, { chapter, key });
    result[key] = { status, evidence: status === 'present' ? evidence : '', note };
  }
  return result;
}

function validateData(data, manuscript, chapter, minScore) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) invalid('Reader review must be a JSON object', { chapter });
  if (String(data.schema_version || '') !== '1.0') invalid('Reader review schema_version must be 1.0', { chapter, schema_version: data.schema_version });
  if (Number(data.chapter) !== Number(chapter)) invalid('Reader review chapter does not match manuscript', { expected: Number(chapter), actual: data.chapter });
  if (!String(data.reviewer_id || '').trim()) invalid('Reader review reviewer_id is required', { chapter });
  if (!VERDICTS.has(data.verdict)) invalid('Reader review verdict must be pass or revise', { chapter, verdict: data.verdict });
  if (!String(data.summary || '').trim()) invalid('Reader review summary is required', { chapter });
  if (!data.scores || typeof data.scores !== 'object' || Array.isArray(data.scores)) invalid('Reader review scores object is required', { chapter });
  for (const key of REQUIRED_SCORES) {
    const score = Number(data.scores[key]);
    if (!Number.isFinite(score) || score < 0 || score > 10) invalid(`Reader review score is invalid: ${key}`, { chapter, key, score: data.scores[key] });
  }
  const sceneEvidence = validateSceneEvidence(data.scene_evidence, manuscript, chapter);
  if (!Array.isArray(data.issues)) invalid('Reader review issues must be an array', { chapter });
  const seen = new Set();
  for (const [index, issue] of data.issues.entries()) {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) invalid('Reader review issue must be an object', { chapter, index });
    const code = String(issue.code || '').trim();
    const severity = String(issue.severity || '').trim();
    const evidence = String(issue.evidence || '').trim();
    const repair = String(issue.repair || '').trim();
    if (!code || !SEVERITIES.has(severity) || !evidence || !repair) invalid('Reader review issue needs code, severity, evidence, and repair', { chapter, index });
    if (!manuscript.body.includes(evidence)) invalid('Reader review evidence must be a literal manuscript excerpt', { chapter, index, code, evidence });
    const key = `${code}\u0000${evidence}`;
    if (seen.has(key)) invalid('Reader review has duplicate issue evidence', { chapter, index, code, evidence });
    seen.add(key);
  }
  const missingScene = REQUIRED_SCENE_EVIDENCE.filter((key) => sceneEvidence[key].status === 'missing');
  if (data.verdict === 'pass' && (data.issues.some((issue) => issue.severity === 'critical') || missingScene.length)) invalid('Pass review cannot include a critical issue or missing required scene evidence', { chapter, missing_scene: missingScene });
  const threshold = Number.isFinite(Number(minScore)) ? Number(minScore) : 7;
  const lowScores = REQUIRED_SCORES.filter((key) => Number(data.scores[key]) < threshold);
  const criticalIssues = data.issues.filter((issue) => issue.severity === 'critical');
  const shouldRevise = data.verdict === 'revise' || lowScores.length > 0 || criticalIssues.length > 0 || missingScene.length > 0;
  return {
    schema_version: '1.0',
    chapter: Number(chapter),
    reviewer_id: String(data.reviewer_id).trim(),
    verdict: data.verdict,
    scores: Object.fromEntries(REQUIRED_SCORES.map((key) => [key, Number(data.scores[key])])),
    scene_evidence: sceneEvidence,
    issues: data.issues.map((issue) => ({ code: String(issue.code).trim(), severity: issue.severity, evidence: String(issue.evidence).trim(), repair: String(issue.repair).trim() })),
    summary: String(data.summary || '').trim(),
    review_of: manuscript.relative,
    manuscript_sha256: require('crypto').createHash('sha256').update(manuscript.text).digest('hex'),
    min_score: threshold,
    low_scores: lowScores,
    critical_issue_count: criticalIssues.length,
    scene_missing: missingScene,
    should_revise: shouldRevise,
  };
}

function validate(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const chapter = Number.parseInt(options.chapter, 10);
  if (!Number.isInteger(chapter) || chapter <= 0) throw new CliError('INVALID_CHAPTER', 'chapter must be a positive integer', { chapter: options.chapter });
  const manuscript = manuscriptOf(project, chapter);
  const review = reviewPath(project, chapter, options.file);
  if (!fs.existsSync(review.absolute)) throw new CliError('CHAPTER_READER_REVIEW_MISSING', `Reader review is missing: ${review.relative}`, { chapter, file: review.relative });
  let raw;
  try { raw = JSON.parse(fs.readFileSync(review.absolute, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { invalid('Reader review JSON parse failed', { chapter, file: review.relative, message: error.message }); }
  const data = validateData(raw, manuscript, chapter, options['min-score'] ?? options.minScore);
  atomicWrite(review.absolute, `${JSON.stringify(data, null, 2)}\n`);
  return { ok: true, project, file: review.relative, data };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (args.command !== 'validate' || !args.project || !args.chapter) throw new CliError('USAGE', 'Usage: node chapter-reader-review.js validate <PROJECT> --chapter N [--file analysis/report.json] [--min-score 7]');
  const report = validate(args.project, args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'chapter-reader-review'); }
}

module.exports = { REQUIRED_SCORES, REQUIRED_SCENE_EVIDENCE, argsOf, chapterId, manuscriptOf, reviewPath, validateSceneEvidence, validateData, validate, run };
