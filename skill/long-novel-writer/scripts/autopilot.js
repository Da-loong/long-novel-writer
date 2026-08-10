#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');
const { validate: validateEvidence } = require('./evidence-audit');

const AUTOPILOT_FILE = 'state/autopilot.json';
const PILOT_FILE = 'state/autopilot-pilot.json';
const LEDGER_FILE = 'state/production-ledger.jsonl';
const PHASES = ['idle', 'discover', 'select', 'breakdown', 'design', 'pilot', 'production', 'review', 'complete'];
const NEXT = { idle: ['discover'], discover: ['select'], select: ['breakdown'], breakdown: ['design'], design: ['pilot'], pilot: ['production'], production: ['review', 'complete'], review: ['production', 'complete'] };

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) args[value.slice(2)] = argv[++index];
    else if (!args.command) args.command = value;
    else if (!args.project) args.project = value;
  }
  return args;
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new CliError('JSON_INVALID', `读取失败：${path.basename(file)}`, { file, message: error.message }); }
}

function stateOf(project) {
  const file = path.join(project, 'state', 'project-state.json');
  const state = readJson(file);
  if (!state) throw new CliError('STATE_MISSING', '缺少 state/project-state.json', { project });
  return state;
}

function defaultState(project, state) {
  return {
    schema_version: '1.0', mode: 'supervised', status: 'idle', phase: 'idle',
    target_words: Number(state.target_words || 1000000), current_chapter: Number(state.updated_through || 0),
    revision_round: 0, max_revision_rounds: 3, chapter_review_interval: 10, last_review_through: 0, project: path.basename(project), updated_at: null,
  };
}

function readState(project) {
  const state = stateOf(project);
  const file = path.join(project, AUTOPILOT_FILE);
  return { projectState: state, autopilot: readJson(file, defaultState(project, state)), pilot: readJson(path.join(project, PILOT_FILE), { status: 'pending', reviewed_through: 0 }) };
}

function appendLedger(project, event) {
  const file = path.join(project, LEDGER_FILE);
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trimEnd() : '';
  atomicWrite(file, `${previous ? `${previous}\n` : ''}${JSON.stringify(event)}\n`);
}

function writeAutopilot(project, value) { atomicWrite(path.join(project, AUTOPILOT_FILE), `${JSON.stringify(value, null, 2)}\n`); }

function chapters(project) {
  const dir = path.join(project, 'manuscript');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => /^ch-\d{4}-.+\.md$/i.test(name)).sort();
}

function nonPlaceholder(project, relative) {
  const file = path.join(project, relative);
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, 'utf8');
  const placeholders = ['待首次策划填写', '尚未执行', '尚未导入', '尚未生成', '尚未完成'];
  return text.trim().length > 80 && !placeholders.some((marker) => text.includes(marker));
}

function readyFor(project, phase) {
  const errors = [];
  if (phase === 'select' && !nonPlaceholder(project, 'analysis/trend-report.md')) errors.push('先生成带来源的 analysis/trend-report.md');
  if (phase === 'breakdown' && (!nonPlaceholder(project, 'settings/reader-contract.md') || !nonPlaceholder(project, 'settings/story-bible.md'))) errors.push('先完成 settings/reader-contract.md 与 settings/story-bible.md');
  if (phase === 'design' && (!nonPlaceholder(project, 'analysis/breakdown.md') || !nonPlaceholder(project, 'outline/master-outline.md') || !nonPlaceholder(project, 'outline/chapter-beats.md') || !/\|\s*\d+\s*\|/.test(fs.readFileSync(path.join(project, 'outline/chapter-beats.md'), 'utf8')))) errors.push('先完成拆书报告、全书大纲和章纲');
  if (phase === 'pilot' && chapters(project).length < 3) errors.push('黄金三章尚未全部落盘');
  if (phase === 'production') {
    const pilot = readJson(path.join(project, PILOT_FILE), { status: 'pending' });
    if (pilot.status !== 'approved' || pilot.auto_confirmed !== true) errors.push('自动试读 verdict 尚未通过');
  }
  return errors;
}

function start(projectInput) {
  const project = path.resolve(projectInput);
  const state = stateOf(project);
  const current = readJson(path.join(project, AUTOPILOT_FILE), defaultState(project, state));
  const now = new Date().toISOString();
  const next = { ...current, mode: 'autopilot', status: 'running', phase: current.phase === 'idle' ? 'discover' : current.phase, target_words: Number(state.target_words || current.target_words || 1000000), current_chapter: Number(state.updated_through || 0), started_at: current.started_at || now, updated_at: now };
  writeAutopilot(project, next);
  appendLedger(project, { schema_version: '1.0', event: 'autopilot_started', phase: next.phase, created_at: now });
  return { ok: true, command: 'start', project, mode: next.mode, phase: next.phase, next_action: `完成 ${next.phase} 阶段后运行 autopilot.js transition --to ${NEXT[next.phase]?.[0] || 'complete'}` };
}

function transition(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  const { autopilot } = readState(project);
  if (autopilot.mode !== 'autopilot') throw new CliError('AUTOPILOT_NOT_STARTED', '先运行 autopilot.js start <项目目录>');
  const target = String(options.to || '').trim();
  if (!PHASES.includes(target) || !(NEXT[autopilot.phase] || []).includes(target)) throw new CliError('INVALID_PHASE_TRANSITION', `不允许从 ${autopilot.phase} 进入 ${target}`, { phase: autopilot.phase, allowed: NEXT[autopilot.phase] || [] });
  const errors = readyFor(project, target);
  if (errors.length) throw new CliError('AUTOPILOT_GATE_FAILED', errors.join('；'), { phase: target, errors });
  const now = new Date().toISOString();
  const next = { ...autopilot, phase: target, status: target === 'complete' ? 'completed' : 'running', updated_at: now };
  writeAutopilot(project, next);
  appendLedger(project, { schema_version: '1.0', event: 'autopilot_phase_transition', from: autopilot.phase, to: target, created_at: now });
  return { ok: true, command: 'transition', project, from: autopilot.phase, phase: target, next_action: NEXT[target]?.[0] ? `完成 ${target} 阶段后运行 autopilot.js transition --to ${NEXT[target][0]}` : '交付完结包' };
}

function pilotPass(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  const { autopilot, pilot } = readState(project);
  if (autopilot.mode !== 'autopilot') throw new CliError('AUTOPILOT_NOT_STARTED', '先运行 autopilot.js start <项目目录>');
  if (pilot.status === 'rejected') throw new CliError('HUMAN_REJECTION_ACTIVE', '真人冷读已拒绝，先完成 supervision/dashboard.md 中的重写与复核', { pilot: path.join(project, 'state', 'pilot-verdict.json'), supervision: path.join(project, 'supervision', 'dashboard.md') });
  const evidencePath = path.resolve(project, options.evidence || '');
  const evidence = readJson(evidencePath);
  if (!evidence) throw new CliError('PILOT_EVIDENCE_MISSING', '需要 --evidence 指向自动盲评 JSON', { evidence: evidencePath });
  const audit = validateEvidence(project, evidence);
  if (!audit.ok) throw new CliError('AUTOPILOT_EVIDENCE_INVALID', '自动盲评缺少可核验目标锚点或原文证据', { evidence: evidencePath, errors: audit.errors });
  const reports = Array.isArray(evidence.reader_reports) ? evidence.reader_reports : [];
  const panelModels = [...new Set(reports.map((report) => String(report?.model_id || '').trim()).filter(Boolean))];
  const panelRoles = [...new Set(reports.map((report) => String(report?.role_id || '').trim()).filter(Boolean))];
  const reviewMode = evidence.review_mode === 'single_model_multi_role' ? 'single_model_multi_role' : 'cross_model';
  const independenceClass = evidence.independence_class || (reviewMode === 'cross_model' ? 'cross_model_independent' : 'role_separated_not_independent');
  const checks = {
    reviewed_through: Number(evidence.reviewed_through || 0) >= 3,
    independent_readers: reports.length >= 3 && Number(evidence.independent_readers || reports.length) >= 3,
    review_mode: ['cross_model', 'single_model_multi_role'].includes(reviewMode),
    independence_class: reviewMode === 'cross_model' ? independenceClass === 'cross_model_independent' : independenceClass === 'role_separated_not_independent',
    reviewer_diversity: reviewMode === 'cross_model'
      ? panelModels.length >= 2 && Number(evidence.distinct_models || panelModels.length) >= 2
      : panelModels.length === 1 && Number(evidence.distinct_models || panelModels.length) === 1 && panelRoles.length >= 3 && Number(evidence.distinct_roles || panelRoles.length) >= 3,
    reader_score: Number(evidence.reader_score || 0) >= 8,
    platform_fit: Number(evidence.platform_fit || 0) >= 8,
    comprehension: Number(evidence.comprehension_pass_rate || 0) >= 0.8,
    continuation: Number(evidence.continuation_rate || 0) >= 0.67,
    target_anchor_coverage: audit.anchor_coverage >= 0.8,
    critical_failures: Number(evidence.critical_failures || audit.critical_failures || 0) === 0,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key);
  if (failures.length) throw new CliError('AUTOPILOT_PILOT_FAILED', '自动盲评未达到放行阈值', { evidence: evidencePath, failures, checks });
  const now = new Date().toISOString();
  const verdict = { schema_version: '1.3', status: 'approved', auto_confirmed: true, reviewed_through: Number(evidence.reviewed_through), reviewer: reviewMode === 'cross_model' ? 'autopilot-cross-model-panel' : 'autopilot-single-model-role-panel', review_mode: reviewMode, independence_class: independenceClass, panel_models: panelModels, panel_roles: panelRoles, reason: evidence.reason || (reviewMode === 'cross_model' ? 'Cross-model blind review reached the automatic release threshold.' : 'Single-model role-separated panel reached the automatic release threshold.'), score: Number(evidence.reader_score), platform_fit: Number(evidence.platform_fit), evidence: path.relative(project, evidencePath).replace(/\\/g, '/'), audit, checks, updated_at: now };
  atomicWrite(path.join(project, PILOT_FILE), `${JSON.stringify(verdict, null, 2)}\n`);
  const next = { ...autopilot, phase: 'production', status: 'running', updated_at: now, revision_round: 0 };
  writeAutopilot(project, next);
  appendLedger(project, { schema_version: '1.0', event: 'autopilot_pilot_approved', reviewed_through: verdict.reviewed_through, score: verdict.score, created_at: now });
  return { ok: true, command: 'pilot-pass', project, verdict, next_action: '进入 production，继续章节事务循环' };
}

function status(projectInput) {
  const project = path.resolve(projectInput);
  const { projectState, autopilot, pilot } = readState(project);
  const humanRejected = pilot.status === 'rejected' || autopilot.status === 'paused' || autopilot.status === 'blocked';
  const releaseToScale = !humanRejected && autopilot.mode === 'autopilot' && pilot.status === 'approved' && pilot.auto_confirmed === true && Number(pilot.reviewed_through || 0) >= 3 && Number(pilot.score || 0) >= 8;
  const updatedThrough = Number(projectState.updated_through || 0);
  const reviewDue = autopilot.phase === 'production' && updatedThrough > Number(autopilot.last_review_through || 0) && updatedThrough > 0 && updatedThrough % Number(autopilot.chapter_review_interval || 10) === 0;
  const next = autopilot.status === 'completed' ? '交付完结包' : reviewDue ? `执行第 ${updatedThrough} 章卷中/中段审计，再更新 last_review_through` : autopilot.phase === 'production' ? `继续第 ${updatedThrough + 1} 章事务` : `完成 ${autopilot.phase} 阶段后 transition`;
  return { ok: true, command: 'status', project, mode: autopilot.mode, status: autopilot.status, phase: autopilot.phase, updated_through: updatedThrough, target_words: Number(projectState.target_words || autopilot.target_words || 0), pilot, human_rejected: humanRejected, release_to_scale: releaseToScale, review_due: reviewDue, next_action: humanRejected ? '先查看 supervision/dashboard.md，完成重写并重新提交真人复核' : next };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.command || !args.project || !['start', 'status', 'transition', 'pilot-pass'].includes(args.command)) throw new CliError('USAGE', '用法: node autopilot.js start|status|transition|pilot-pass <项目目录> [--to 阶段] [--evidence JSON]');
  const report = args.command === 'start' ? start(args.project) : args.command === 'status' ? status(args.project) : args.command === 'transition' ? transition(args.project, args) : pilotPass(args.project, args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'autopilot'); }
}

module.exports = { AUTOPILOT_FILE, PILOT_FILE, PHASES, NEXT, argsOf, readState, readyFor, start, transition, pilotPass, status, run };
