#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const MANIFEST_FILE = path.join(__dirname, '..', 'references', 'operations', 'workflow-manifest.json');
const RUN_FILE = 'state/workflow-run.json';
const LEDGER_FILE = 'state/workflow-ledger.jsonl';
const POST_HOC_FILE = 'state/post-hoc-ledger.jsonl';

function argsOf(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value.startsWith('--')) {
      const key = value.slice(2);
      const next = argv[i + 1];
      args[key] = next !== undefined && !next.startsWith('--') ? next : true;
      if (args[key] !== true) i++;
    } else if (!args.command) args.command = value;
    else if (!args.project) args.project = value;
    else if (!args.node) args.node = value;
  }
  return args;
}

function sha256Buffer(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sha256(file) { return sha256Buffer(fs.readFileSync(file)); }
function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { throw new CliError('JSON_INVALID', `Invalid JSON: ${path.basename(file)}`, { file, message: error.message }); }
}
function writeJson(file, value) { atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`); }
function appendJsonl(file, value) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trimEnd() : '';
  atomicWrite(file, `${current ? `${current}\n` : ''}${JSON.stringify(value)}\n`);
}
function manifest() {
  const value = readJson(MANIFEST_FILE);
  if (!value || value.schema_version !== '1.0' || !Array.isArray(value.nodes) || !value.nodes.length) {
    throw new CliError('WORKFLOW_MANIFEST_INVALID', 'Workflow manifest is missing or malformed', { file: MANIFEST_FILE });
  }
  const ids = new Set();
  for (const node of value.nodes) {
    if (!node.id || ids.has(node.id) || !node.type || !Array.isArray(node.inputs) || !Array.isArray(node.outputs)) {
      throw new CliError('WORKFLOW_NODE_INVALID', 'Every workflow node needs a unique id, type, inputs and outputs', { node });
    }
    ids.add(node.id);
  }
  return value;
}
function projectOf(projectInput) {
  const project = path.resolve(projectInput || '');
  if (!projectInput || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}
function runState(project) { return readJson(path.join(project, RUN_FILE)); }
function nodeOf(flow, id) {
  const node = flow.nodes.find((item) => item.id === id);
  if (!node) throw new CliError('WORKFLOW_NODE_NOT_FOUND', `Unknown workflow node: ${id}`, { node: id });
  return node;
}
function nextNode(flow, completed) { return flow.nodes.find((item) => !completed.includes(item.id)) || null; }
function artifactList(project, input) {
  const values = String(input || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!values.length) throw new CliError('ARTIFACTS_REQUIRED', 'At least one artifact path is required', {});
  return values.map((value) => {
    const absolute = path.resolve(project, value);
    const relative = path.relative(project, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new CliError('PATH_ESCAPE', 'Artifact path must stay inside the project', { value });
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new CliError('ARTIFACT_NOT_FOUND', 'Artifact file not found', { path: relative.replace(/\\/g, '/') });
    return { path: relative.replace(/\\/g, '/'), bytes: fs.statSync(absolute).size, sha256: sha256(absolute) };
  });
}
function start(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const flow = manifest();
  const existing = runState(project);
  if (existing && ['running', 'blocked'].includes(existing.status)) throw new CliError('WORKFLOW_ACTIVE', 'A workflow task is already active; use status or resume', { run: existing });
  const projectState = readJson(path.join(project, 'state', 'project-state.json'), {});
  const first = flow.nodes[0];
  const now = new Date().toISOString();
  const state = {
    schema_version: '1.0', task_id: `book-production-${Date.now()}`, workflow_id: flow.workflow_id,
    workflow_version: flow.version, manifest_sha256: sha256(MANIFEST_FILE),
    input_snapshot: { target_words: Number(projectState.target_words || 0), updated_through: Number(projectState.updated_through || 0), options },
    status: 'running', current_node: first.id, completed_nodes: [], failed_node: null, attempts: { [first.id]: 1 },
    checkpoints: [], created_at: now, updated_at: now,
  };
  writeJson(path.join(project, RUN_FILE), state);
  appendJsonl(path.join(project, LEDGER_FILE), { event: 'task_started', task_id: state.task_id, node: first.id, attempt: 1, manifest_sha256: state.manifest_sha256, created_at: now });
  return { ok: true, command: 'start', project, task_id: state.task_id, workflow_id: state.workflow_id, current_node: first.id, manifest_sha256: state.manifest_sha256 };
}
function status(projectInput) {
  const project = projectOf(projectInput);
  const state = runState(project);
  if (!state) return { ok: true, command: 'status', project, status: 'idle', current_node: null };
  const flow = manifest();
  const current = state.current_node ? nodeOf(flow, state.current_node) : null;
  return { ok: true, command: 'status', project, task_id: state.task_id, status: state.status, current_node: state.current_node, current_type: current?.type || null, completed_nodes: state.completed_nodes, failed_node: state.failed_node, attempts: state.attempts, manifest_frozen: state.manifest_sha256 === sha256(MANIFEST_FILE), next_action: state.status === 'running' ? `execute ${state.current_node} then checkpoint` : state.status === 'blocked' ? `retry ${state.failed_node}` : state.status === 'done' ? 'workflow complete' : 'start workflow' };
}
function checkpoint(projectInput, nodeId, options = {}) {
  const project = projectOf(projectInput); const state = runState(project); const flow = manifest();
  if (!state) throw new CliError('WORKFLOW_NOT_STARTED', 'Start a workflow before checkpointing', { project });
  if (state.status !== 'running') throw new CliError('WORKFLOW_NOT_RUNNING', 'Workflow is not in a running state', { status: state.status });
  if (state.current_node !== nodeId) throw new CliError('NODE_NOT_CURRENT', 'Checkpoint must target the current node', { current_node: state.current_node, node: nodeId });
  nodeOf(flow, nodeId);
  const artifacts = artifactList(project, options.artifacts);
  const now = new Date().toISOString();
  const checkpointRecord = { node: nodeId, attempt: Number(state.attempts[nodeId] || 1), artifacts, result_sha256: sha256Buffer(JSON.stringify(artifacts)), completed_at: now };
  state.completed_nodes.push(nodeId); state.checkpoints.push(checkpointRecord); state.failed_node = null;
  const next = nextNode(flow, state.completed_nodes); state.current_node = next?.id || null; state.status = next ? 'running' : 'done'; state.updated_at = now;
  if (next) state.attempts[next.id] = Number(state.attempts[next.id] || 0) + 1;
  writeJson(path.join(project, RUN_FILE), state);
  appendJsonl(path.join(project, LEDGER_FILE), { event: 'node_checkpointed', task_id: state.task_id, ...checkpointRecord, next_node: state.current_node, status: state.status });
  return { ok: true, command: 'checkpoint', project, node: nodeId, status: state.status, next_node: state.current_node, artifacts };
}
function fail(projectInput, nodeId, options = {}) {
  const project = projectOf(projectInput); const state = runState(project);
  if (!state || state.status !== 'running') throw new CliError('WORKFLOW_NOT_RUNNING', 'A running workflow is required', {});
  if (state.current_node !== nodeId) throw new CliError('NODE_NOT_CURRENT', 'Failure must target the current node', { current_node: state.current_node, node: nodeId });
  const reason = String(options.reason || '').trim(); if (!reason) throw new CliError('FAILURE_REASON_REQUIRED', 'Provide --reason for a failed node', {});
  const now = new Date().toISOString(); state.status = 'blocked'; state.failed_node = nodeId; state.failure_reason = reason; state.updated_at = now; writeJson(path.join(project, RUN_FILE), state);
  appendJsonl(path.join(project, LEDGER_FILE), { event: 'node_failed', task_id: state.task_id, node: nodeId, attempt: Number(state.attempts[nodeId] || 1), reason, created_at: now });
  return { ok: true, command: 'fail', project, node: nodeId, status: state.status, reason };
}
function retry(projectInput, nodeId) {
  const project = projectOf(projectInput); const state = runState(project); const flow = manifest(); nodeOf(flow, nodeId);
  if (!state || state.status !== 'blocked' || state.failed_node !== nodeId) throw new CliError('RETRY_NOT_ALLOWED', 'Retry must target the blocked node', { failed_node: state?.failed_node || null, status: state?.status || 'idle' });
  const attempt = Number(state.attempts[nodeId] || 1) + 1; const max = Number(flow.policy.max_attempts_per_node || 3);
  if (attempt > max) throw new CliError('RETRY_LIMIT', 'Maximum node attempts exceeded', { node: nodeId, attempt, max });
  const now = new Date().toISOString(); state.status = 'running'; state.current_node = nodeId; state.failed_node = null; state.failure_reason = null; state.attempts[nodeId] = attempt; state.updated_at = now; writeJson(path.join(project, RUN_FILE), state);
  appendJsonl(path.join(project, LEDGER_FILE), { event: 'node_retry_scheduled', task_id: state.task_id, node: nodeId, attempt, created_at: now });
  return { ok: true, command: 'retry', project, node: nodeId, attempt, status: state.status };
}
function postHoc(projectInput, options = {}) {
  const project = projectOf(projectInput); const chapter = Number.parseInt(options.chapter, 10); const summary = String(options.summary || '').trim();
  if (!Number.isInteger(chapter) || chapter <= 0) throw new CliError('INVALID_CHAPTER', 'Chapter must be a positive integer', { chapter: options.chapter });
  if (!summary) throw new CliError('POST_HOC_SUMMARY_REQUIRED', 'Provide --summary for continuity post-hoc', {});
  const artifacts = options.artifacts ? artifactList(project, options.artifacts) : [];
  const now = new Date().toISOString(); const record = { schema_version: '1.0', chapter, summary, artifacts, created_at: now };
  appendJsonl(path.join(project, POST_HOC_FILE), record);
  const state = runState(project); if (state) { state.last_post_hoc = { chapter, created_at: now, summary_sha256: sha256Buffer(summary) }; state.updated_at = now; writeJson(path.join(project, RUN_FILE), state); }
  return { ok: true, command: 'post-hoc', project, chapter, artifacts, output: path.join(project, POST_HOC_FILE) };
}
function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv); if (!args.command || !args.project || !['start', 'status', 'checkpoint', 'fail', 'retry', 'post-hoc'].includes(args.command)) throw new CliError('USAGE', 'Usage: workflow-runner.js start|status|checkpoint|fail|retry|post-hoc <PROJECT> [NODE] [options]');
  const report = args.command === 'start' ? start(args.project, args) : args.command === 'status' ? status(args.project) : args.command === 'checkpoint' ? checkpoint(args.project, args.node, args) : args.command === 'fail' ? fail(args.project, args.node, args) : args.command === 'retry' ? retry(args.project, args.node) : postHoc(args.project, args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); return report;
}
if (require.main === module) { try { run(); } catch (error) { process.exitCode = emitError(error, 'workflow-runner'); } }
module.exports = { MANIFEST_FILE, RUN_FILE, LEDGER_FILE, POST_HOC_FILE, argsOf, manifest, start, status, checkpoint, fail, retry, postHoc, run };
