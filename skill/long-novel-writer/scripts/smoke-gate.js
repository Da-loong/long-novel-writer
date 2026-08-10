#!/usr/bin/env node
'use strict';

/* Three-chapter release gate: content evidence must exist before scale production. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CliError, emitError, countText } = require('./cap-utils');
const chapterGate = require('./chapter-gate');
const chapterReaderReview = require('./chapter-reader-review');
const chapterFacts = require('./chapter-facts');

function argsOf(argv) {
  const out = { min_chars: '2000', min_score: '7' };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value.startsWith('--')) out[value.slice(2)] = argv[++i];
    else if (!out.project) out.project = value;
  }
  return out;
}
function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function chapterFiles(project, chapter) {
  const dir = path.join(project, 'manuscript');
  const re = new RegExp(`^ch-${String(chapter).padStart(4, '0')}-.+\\.md$`, 'i');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => re.test(name)).sort().map((name) => path.join(dir, name)) : [];
}
function latestReview(project, chapter) {
  const dir = path.join(project, 'analysis');
  const re = new RegExp(`^chapter-reader-review-ch${String(chapter).padStart(4, '0')}-r\\d+\\.json$`, 'i');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => re.test(name)).sort() : [];
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}
function validate(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const minChars = String(options['min-chars'] || options.min_chars || '2000');
  const minScore = String(options['min-score'] || options.min_score || '7');
  const errors = [];
  const chapters = [];
  for (let chapter = 1; chapter <= 3; chapter++) {
    const files = chapterFiles(project, chapter);
    const item = { chapter, manuscript: files.length === 1 ? path.relative(project, files[0]).replace(/\\/g, '/') : null, checks: [] };
    if (files.length !== 1) {
      errors.push({ code: 'SMOKE_MANUSCRIPT_SHAPE', chapter, files: files.map((file) => path.relative(project, file)) });
      chapters.push(item);
      continue;
    }
    const gate = chapterGate.gate(project, { stage: 'post', chapter: String(chapter), 'min-chars': minChars });
    item.checks.push({ name: 'chapter_gate', ok: gate.ok, errors: gate.errors });
    if (!gate.ok) errors.push({ code: 'SMOKE_CHAPTER_GATE', chapter, errors: gate.errors });
    const text = fs.readFileSync(files[0], 'utf8');
    item.chinese_chars = countText(text).chinese_chars;
    const reviewFile = latestReview(project, chapter);
    if (!reviewFile) {
      errors.push({ code: 'SMOKE_READER_REVIEW_MISSING', chapter });
    } else {
      try {
        const reviewed = chapterReaderReview.validate(project, { chapter: String(chapter), file: path.relative(project, reviewFile).replace(/\\/g, '/'), 'min-score': minScore });
        const hashOk = reviewed.data.manuscript_sha256 === sha256(files[0]);
        item.checks.push({ name: 'reader_review', file: path.relative(project, reviewFile).replace(/\\/g, '/'), verdict: reviewed.data.verdict, hash_ok: hashOk, should_revise: reviewed.data.should_revise });
        if (!hashOk || reviewed.data.should_revise || reviewed.data.verdict !== 'pass') errors.push({ code: 'SMOKE_READER_REVIEW_NOT_PASSED', chapter, file: path.relative(project, reviewFile).replace(/\\/g, '/') });
      } catch (error) {
        errors.push({ code: 'SMOKE_READER_REVIEW_INVALID', chapter, message: error.message });
      }
    }
    const factFile = path.join(project, 'analysis', `chapter-facts-ch${String(chapter).padStart(4, '0')}.json`);
    const factLedger = path.join(project, chapterFacts.FACT_LEDGER_DIR, `ch-${String(chapter).padStart(4, '0')}.json`);
    if (!fs.existsSync(factFile) || !fs.existsSync(factLedger)) {
      errors.push({ code: 'SMOKE_FACT_LEDGER_MISSING', chapter, report: path.relative(project, factFile), ledger: path.relative(project, factLedger) });
    } else {
      try {
        const facts = chapterFacts.validate(project, { chapter: String(chapter), file: path.relative(project, factFile).replace(/\\/g, '/') });
        item.checks.push({ name: 'chapter_facts', ok: true, facts: facts.data.facts.length });
      } catch (error) {
        errors.push({ code: 'SMOKE_FACT_LEDGER_INVALID', chapter, message: error.message });
      }
    }
    chapters.push(item);
  }
  const pilot = fs.existsSync(path.join(project, 'state', 'autopilot-pilot.json')) ? JSON.parse(fs.readFileSync(path.join(project, 'state', 'autopilot-pilot.json'), 'utf8')) : null;
  const human = fs.existsSync(path.join(project, 'state', 'pilot-verdict.json')) ? JSON.parse(fs.readFileSync(path.join(project, 'state', 'pilot-verdict.json'), 'utf8')) : null;
  const release = Boolean((pilot && pilot.status === 'approved' && pilot.auto_confirmed === true && Number(pilot.reviewed_through || 0) >= 3) || (human && human.status === 'approved' && human.human_confirmed === true && human.human_confirmation_method === 'explicit_cli_flag' && Number(human.reviewed_through || 0) >= 3));
  if (!release) errors.push({ code: 'SMOKE_PILOT_RELEASE_MISSING' });
  return { ok: errors.length === 0, command: 'smoke-gate', project, chapters, release_ready: release, errors, next: errors.length ? 'repair the skill pipeline or evidence, then rerun smoke-gate' : 'scale production may start' };
}
function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project) throw new CliError('USAGE', 'Usage: node smoke-gate.js <PROJECT> [--min-chars 2000] [--min-score 7]');
  const report = validate(args.project, args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 3;
  return report;
}
if (require.main === module) { try { run(); } catch (error) { process.exitCode = emitError(error, 'smoke-gate'); } }
module.exports = { argsOf, chapterFiles, latestReview, validate, run };
