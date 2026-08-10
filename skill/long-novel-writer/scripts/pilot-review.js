#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const PILOT_FILE = 'state/pilot-verdict.json';
const AUTOPILOT_FILE = 'state/autopilot.json';
const AUTOPILOT_PILOT_FILE = 'state/autopilot-pilot.json';
const LEDGER_FILE = 'state/production-ledger.jsonl';

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
  const state = readJson(path.join(project, 'state', 'project-state.json'));
  if (!state) throw new CliError('STATE_MISSING', '缺少 state/project-state.json', { project });
  return state;
}

function status(projectInput) {
  const project = path.resolve(projectInput);
  const projectState = stateOf(project);
  const verdict = readJson(path.join(project, PILOT_FILE), {
    schema_version: '1.0', status: 'pending', reviewed_through: 0, updated_at: null,
  });
  const autopilot = readJson(path.join(project, AUTOPILOT_FILE), { mode: 'supervised', status: 'idle', phase: 'idle' });
  const autopilotPilot = readJson(path.join(project, AUTOPILOT_PILOT_FILE), { status: 'pending', reviewed_through: 0, auto_confirmed: false });
  const human_release = verdict.status === 'approved' && Number(verdict.reviewed_through || 0) >= 3 && verdict.human_confirmed === true;
  const autopilot_release = autopilot.mode === 'autopilot' && autopilotPilot.status === 'approved' && autopilotPilot.auto_confirmed === true && Number(autopilotPilot.reviewed_through || 0) >= 3 && Number(autopilotPilot.score || 0) >= 8;
  const release_to_scale = human_release || autopilot_release;
  return {
    ok: true, command: 'status', project, target_words: Number(projectState.target_words || 0),
    updated_through: Number(projectState.updated_through || 0), verdict, autopilot, autopilot_pilot: autopilotPilot, human_release, autopilot_release, release_to_scale,
    next_action: release_to_scale ? 'continue chapter transactions' : autopilot.mode === 'autopilot' ? 'run independent blind panel, then autopilot.js pilot-pass' : 'obtain human cold-read verdict on chapters 1-3',
  };
}

function decide(projectInput, command, options = {}) {
  const project = path.resolve(projectInput);
  const projectState = stateOf(project);
  const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
  const reviewer = typeof options.reviewer === 'string' ? options.reviewer.trim() : '';
  const reviewedThrough = Number.parseInt(options['reviewed-through'] || String(projectState.updated_through || 0), 10);
  if (!reason) throw new CliError('PILOT_REASON_MISSING', '试读结论必须记录 --reason', { command });
  if (!reviewer) throw new CliError('PILOT_REVIEWER_MISSING', '试读结论必须记录 --reviewer', { command });
  if (!Number.isInteger(reviewedThrough) || reviewedThrough < 1 || reviewedThrough > Number(projectState.updated_through || 0)) {
    throw new CliError('PILOT_REVIEW_RANGE_INVALID', 'reviewed-through 必须是已经落盘的正文章号', { reviewedThrough, updated_through: projectState.updated_through });
  }
  if (command === 'approve' && options['human-confirmed'] !== true) {
    throw new CliError('HUMAN_CONFIRMATION_REQUIRED', '放行长篇扩写必须带 --human-confirmed，模型自评不得代替真人冷读', { reviewedThrough });
  }
  if (command === 'approve' && reviewedThrough < 3) {
    throw new CliError('PILOT_TOO_SHORT', '至少冷读黄金三章后才能放行规模化续写', { reviewedThrough });
  }
  const now = new Date().toISOString();
  const verdict = {
    schema_version: '1.0', status: command === 'approve' ? 'approved' : 'rejected', reviewed_through: reviewedThrough,
    reviewer, reason, human_confirmed: command === 'approve', human_confirmation_method: command === 'approve' ? 'explicit_cli_flag' : null, updated_at: now,
  };
  atomicWrite(path.join(project, PILOT_FILE), `${JSON.stringify(verdict, null, 2)}\n`);
  appendLedger(project, {
    schema_version: '1.0', event: command === 'approve' ? 'pilot_approved' : 'pilot_rejected', reviewed_through: reviewedThrough,
    reviewer, reason, created_at: now,
  });
  return { ok: true, command, project, verdict, release_to_scale: verdict.status === 'approved' };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.command || !args.project || !['status', 'approve', 'reject'].includes(args.command)) {
    throw new CliError('USAGE', '用法: node pilot-review.js status|approve|reject <项目目录> [--reviewed-through N] [--reviewer 名称] [--reason 说明] [--human-confirmed]');
  }
  const report = args.command === 'status' ? status(args.project) : decide(args.project, args.command, args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'pilot-review'); }
}

module.exports = { PILOT_FILE, AUTOPILOT_FILE, AUTOPILOT_PILOT_FILE, argsOf, status, decide, run };
