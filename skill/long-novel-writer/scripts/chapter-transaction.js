#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');
const { build } = require('./context-pack');
const { gate } = require('./chapter-gate');

const TRANSACTION_FILE = 'state/chapter-transaction.json';
const LEDGER_FILE = 'state/production-ledger.jsonl';
const PILOT_FILE = 'state/pilot-verdict.json';

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) {
      const key = value.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; index++; }
    } else if (!args.command) args.command = value;
    else if (!args.project) args.project = value;
  }
  return args;
}

function digestText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function digestFile(file) {
  return digestText(fs.readFileSync(file));
}

function canonFiles(project) {
  const files = [];
  const settings = path.join(project, 'settings');
  if (fs.existsSync(settings)) for (const name of fs.readdirSync(settings)) if (name.endsWith('.md')) files.push(`settings/${name}`);
  const outline = path.join(project, 'outline');
  if (fs.existsSync(outline)) for (const name of fs.readdirSync(outline)) {
    if (/^(?:master-outline|chapter-beats|volume(?:-|_).+)\.md$/i.test(name)) files.push(`outline/${name}`);
  }
  return files.sort();
}

function canonManifest(project) {
  return Object.fromEntries(canonFiles(project).map((name) => [name, digestFile(path.join(project, name))]));
}

function manifestDiff(before = {}, after = {}) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap((name) => {
    if (!(name in before)) return [{ file: name, change: 'added', before: null, after: after[name] }];
    if (!(name in after)) return [{ file: name, change: 'removed', before: before[name], after: null }];
    if (before[name] !== after[name]) return [{ file: name, change: 'modified', before: before[name], after: after[name] }];
    return [];
  });
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function appendLedger(project, event) {
  const file = path.join(project, LEDGER_FILE);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trimEnd() : '';
  atomicWrite(file, `${current ? `${current}\n` : ''}${JSON.stringify(event)}\n`);
}

function stateOf(project) {
  const file = path.join(project, 'state', 'project-state.json');
  if (!fs.existsSync(file)) throw new CliError('STATE_MISSING', '缺少 state/project-state.json', { project });
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function numericRange(options) {
  const minimum = Number.parseInt(options['min-chars'] || '1200', 10);
  const maximum = options['max-chars'] === undefined ? null : Number.parseInt(options['max-chars'], 10);
  if (!Number.isFinite(minimum) || minimum <= 0) throw new CliError('INVALID_MIN_CHARS', 'min-chars 必须为正整数', { value: options['min-chars'] });
  if (maximum !== null && (!Number.isFinite(maximum) || maximum <= 0)) throw new CliError('INVALID_MAX_CHARS', 'max-chars 必须为正整数', { value: options['max-chars'] });
  if (maximum !== null && maximum < minimum) throw new CliError('INVALID_CHAR_RANGE', 'max-chars 不得小于 min-chars', { minimum, maximum });
  return { minimum, maximum };
}

function requirePilotApproval(project, state, chapter) {
  if (chapter <= 3 || Number(state.target_words || 0) < 300000) return;
  const verdict = readJson(path.join(project, PILOT_FILE), { status: 'pending', reviewed_through: 0 });
  if (verdict.status !== 'approved' || Number(verdict.reviewed_through || 0) < 3 || verdict.human_confirmed !== true) {
    throw new CliError('PILOT_NOT_APPROVED', '黄金三章尚未通过真人冷读，已阻止规模化续写', {
      pilot: path.join(project, PILOT_FILE), status: verdict.status || 'pending', reviewed_through: Number(verdict.reviewed_through || 0),
      next: `node pilot-review.js approve "${project}" --reviewed-through 3 --reviewer <真人> --reason <结论> --human-confirmed`,
    });
  }
}

function begin(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  const transactionPath = path.join(project, TRANSACTION_FILE);
  const existing = readJson(transactionPath, { phase: 'idle' });
  if (existing.phase === 'drafting') throw new CliError('TRANSACTION_ACTIVE', `第 ${existing.chapter} 章事务尚未完成`, { transaction: transactionPath, next: `finish ${project} --chapter ${existing.chapter}` });
  const state = stateOf(project);
  const chapter = Number.parseInt(options.chapter || String(Number(state.updated_through || 0) + 1), 10);
  const expected = Number(state.updated_through || 0) + 1;
  if (chapter !== expected) throw new CliError('NEXT_CHAPTER_MISMATCH', `下一章应为 ${expected}`, { expected, chapter });
  requirePilotApproval(project, state, chapter);
  const range = numericRange(options);
  const context = build(project, { chapter: String(chapter), query: options.query || '', recent: options.recent, retrieve: options.retrieve, budget: options.budget });
  const contextPath = path.join(project, 'state', 'context-pack.md');
  atomicWrite(contextPath, context.markdown);
  const pre = gate(project, { stage: 'pre', chapter: String(chapter) });
  if (!pre.ok) return { ok: false, command: 'begin', project, chapter, errors: pre.errors, warnings: pre.warnings, transaction_written: false };
  const now = new Date().toISOString();
  const transaction = {
    schema_version: '1.0', transaction_id: `ch-${String(chapter).padStart(4, '0')}-${Date.now()}`, phase: 'drafting', chapter,
    created_at: now, updated_at: now, failures: 0, min_chars: range.minimum, max_chars: range.maximum,
    context_pack: { path: 'state/context-pack.md', sha256: digestFile(contextPath), manifest: context.manifest },
    canon: canonManifest(project), last_result: { pre_gate_ok: true },
  };
  atomicWrite(transactionPath, `${JSON.stringify(transaction, null, 2)}\n`);
  return { ok: true, command: 'begin', project, chapter, transaction: transactionPath, context: contextPath, range, source_count: context.manifest.sources.length };
}

function chapterFile(project, chapter) {
  const manuscript = path.join(project, 'manuscript');
  const pattern = new RegExp(`^ch-${String(chapter).padStart(4, '0')}-.+\\.md$`, 'i');
  const name = fs.existsSync(manuscript) ? fs.readdirSync(manuscript).find((item) => pattern.test(item)) : null;
  return name ? path.join(manuscript, name) : null;
}

function finish(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  const transactionPath = path.join(project, TRANSACTION_FILE);
  const transaction = readJson(transactionPath);
  if (!transaction || transaction.phase !== 'drafting') throw new CliError('NO_ACTIVE_TRANSACTION', '当前没有处于 drafting 状态的章节事务', { transaction: transactionPath });
  const chapter = Number.parseInt(options.chapter || String(transaction.chapter), 10);
  if (chapter !== transaction.chapter) throw new CliError('TRANSACTION_CHAPTER_MISMATCH', `活动事务为第 ${transaction.chapter} 章`, { requested: chapter });
  const currentCanon = canonManifest(project);
  const mutations = manifestDiff(transaction.canon, currentCanon);
  const approval = options['approve-canon'] === true;
  const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
  const errors = [];
  if (mutations.length && !approval) errors.push({ severity: 'error', code: 'CANON_MUTATION_UNAPPROVED', file: 'settings|outline', detail: `${mutations.length} locked canon file(s) changed after begin` });
  if (mutations.length && approval && !reason) errors.push({ severity: 'error', code: 'CANON_APPROVAL_REASON_MISSING', file: TRANSACTION_FILE, detail: 'use --reason to record why canon changes were approved' });
  const post = gate(project, { stage: 'post', chapter: String(chapter), 'min-chars': String(transaction.min_chars), ...(transaction.max_chars === null ? {} : { 'max-chars': String(transaction.max_chars) }) });
  errors.push(...post.errors);
  const now = new Date().toISOString();
  if (errors.length) {
    transaction.failures = Number(transaction.failures || 0) + 1;
    transaction.updated_at = now;
    transaction.last_result = { post_gate_ok: false, errors, canon_mutations: mutations };
    atomicWrite(transactionPath, `${JSON.stringify(transaction, null, 2)}\n`);
    return { ok: false, command: 'finish', project, chapter, errors, warnings: post.warnings, failures: transaction.failures, canon_mutations: mutations };
  }
  const manuscript = chapterFile(project, chapter);
  const event = {
    schema_version: '1.0', event: 'chapter_committed', transaction_id: transaction.transaction_id, chapter, completed_at: now,
    manuscript: path.relative(project, manuscript).replace(/\\/g, '/'), manuscript_sha256: digestFile(manuscript),
    min_chars: transaction.min_chars, max_chars: transaction.max_chars, canon_mutations: mutations,
    canon_approval: mutations.length ? { approved: true, reason } : { approved: false, reason: null }, failures_before_pass: transaction.failures,
  };
  appendLedger(project, event);
  transaction.phase = 'completed';
  transaction.updated_at = now;
  transaction.completed_at = now;
  transaction.last_result = { post_gate_ok: true, event };
  transaction.canon_after = currentCanon;
  atomicWrite(transactionPath, `${JSON.stringify(transaction, null, 2)}\n`);
  return { ok: true, command: 'finish', project, chapter, transaction: transactionPath, ledger: path.join(project, LEDGER_FILE), event, warnings: post.warnings };
}

function abort(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  const transactionPath = path.join(project, TRANSACTION_FILE);
  const transaction = readJson(transactionPath);
  if (!transaction || transaction.phase !== 'drafting') throw new CliError('NO_ACTIVE_TRANSACTION', '当前没有可中止的章节事务', { transaction: transactionPath });
  const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
  if (!reason) throw new CliError('ABORT_REASON_MISSING', '中止事务必须记录 --reason', { chapter: transaction.chapter });
  const now = new Date().toISOString();
  const event = { schema_version: '1.0', event: 'chapter_aborted', transaction_id: transaction.transaction_id, chapter: transaction.chapter, aborted_at: now, reason };
  appendLedger(project, event);
  transaction.phase = 'aborted'; transaction.updated_at = now; transaction.aborted_at = now; transaction.abort_reason = reason;
  atomicWrite(transactionPath, `${JSON.stringify(transaction, null, 2)}\n`);
  return { ok: true, command: 'abort', project, chapter: transaction.chapter, reason };
}

function status(projectInput) {
  const project = path.resolve(projectInput);
  const state = stateOf(project);
  const transaction = readJson(path.join(project, TRANSACTION_FILE), { schema_version: '1.0', phase: 'idle' });
  const ledgerPath = path.join(project, LEDGER_FILE);
  const ledger = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-10).map((line) => JSON.parse(line)) : [];
  const nextChapter = Number(state.updated_through || 0) + 1;
  const has_active_transaction = transaction.phase === 'drafting';
  const next_action = has_active_transaction ? `finish --chapter ${transaction.chapter}` : `begin --chapter ${nextChapter}`;
  return { ok: true, command: 'status', project, updated_through: Number(state.updated_through || 0), has_active_transaction, transaction, recent_events: ledger, next_action };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.command || !args.project || !['begin', 'finish', 'abort', 'status'].includes(args.command)) throw new CliError('USAGE', '用法: node chapter-transaction.js begin|finish|abort|status <项目目录> [--chapter N] [--query 关键词] [--min-chars 1200] [--max-chars 3500] [--approve-canon --reason 说明]');
  const report = args.command === 'begin' ? begin(args.project, args) : args.command === 'finish' ? finish(args.project, args) : args.command === 'abort' ? abort(args.project, args) : status(args.project);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 3;
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'chapter-transaction'); }
}

module.exports = { TRANSACTION_FILE, LEDGER_FILE, PILOT_FILE, argsOf, digestText, canonFiles, canonManifest, manifestDiff, numericRange, requirePilotApproval, begin, finish, abort, status, run };
