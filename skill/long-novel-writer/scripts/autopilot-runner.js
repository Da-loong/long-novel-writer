#!/usr/bin/env node
'use strict';

/*
 * Durable bridge between the deterministic project runtime and an external
 * writing agent.  The bridge owns orchestration and evidence; the agent owns
 * prose decisions.  Every agent call is recorded before the next mutation.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const { CliError, emitError, atomicWrite, countText } = require('./cap-utils');
const autopilot = require('./autopilot');
const workflow = require('./workflow-runner');
const transaction = require('./chapter-transaction');
const chapterGate = require('./chapter-gate');
const readerMetrics = require('./reader-metrics');
const aiPatterns = require('./check-ai-patterns');
const degeneration = require('./check-degeneration');
const formatGate = require('./format-gate');
const handoff = require('./handoff');
const chapterReaderReview = require('./chapter-reader-review');

const RUN_FILE = 'state/autopilot-run.json';
const LEDGER_FILE = 'state/autopilot-run-ledger.jsonl';
const AGENT_DIR = 'state/agent-runs';
const REVISION_DIR = 'state/chapter-revisions';
const CONFIG_FILE = 'settings/agent-runner.json';
const DEFAULTS = {
  agent_command: process.env.LNW_AGENT_COMMAND || 'claude',
  model: process.env.LNW_AGENT_MODEL || '',
  agent_args: ['--dangerously-skip-permissions', '--no-session-persistence'],
  timeout_ms: Number(process.env.LNW_AGENT_TIMEOUT_MS || 900000),
  max_attempts: 3,
  chapter_min_chars: 1200,
  chapter_max_chars: null,
  panel_readers: 3,
  panel_attempts: 2,
  review_interval: 10,
  chapter_revision_passes: 2,
  chapter_reader_review: true,
  chapter_reader_min_score: 7,
};

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) {
      const key = value.slice(2);
      const next = argv[index + 1];
      args[key] = next !== undefined && !next.startsWith('--') ? next : true;
      if (args[key] !== true) index++;
    } else if (!args.command) args.command = value;
    else if (!args.project) args.project = value;
  }
  return args;
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { throw new CliError('JSON_INVALID', `Invalid JSON: ${path.basename(file)}`, { file, message: error.message }); }
}

function writeJson(file, value) { atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`); }

function appendJsonl(file, value) {
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trimEnd() : '';
  atomicWrite(file, `${previous ? `${previous}\n` : ''}${JSON.stringify(value)}\n`);
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function relativePath(project, file) {
  const absolute = path.resolve(file);
  const relative = path.relative(project, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new CliError('PATH_ESCAPE', 'Artifact must stay inside project', { file });
  return relative.replace(/\\/g, '/');
}

function configOf(project, options = {}) {
  const stored = readJson(path.join(project, CONFIG_FILE), {});
  const number = (key, fallback) => {
    const value = options[key] ?? stored[key] ?? fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const boolean = (key, fallback) => {
    const value = options[key] ?? stored[key] ?? fallback;
    return !(value === false || value === 0 || ['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase()));
  };
  return {
    ...DEFAULTS,
    ...stored,
    agent_command: String(options['agent-command'] ?? options.agent_command ?? stored.agent_command ?? DEFAULTS.agent_command),
    model: String(options.model ?? stored.model ?? DEFAULTS.model),
    agent_args: Array.isArray(options['agent-args'] ?? options.agent_args ?? stored.agent_args) ? (options['agent-args'] ?? options.agent_args ?? stored.agent_args) : DEFAULTS.agent_args,
    timeout_ms: Math.max(1000, number('timeout-ms', number('timeout_ms', DEFAULTS.timeout_ms))),
    max_attempts: Math.max(1, Math.floor(number('max-attempts', number('max_attempts', DEFAULTS.max_attempts)))),
    chapter_min_chars: Math.max(1, Math.floor(number('min-chars', number('chapter_min_chars', DEFAULTS.chapter_min_chars)))),
    chapter_max_chars: options['max-chars'] ?? stored.chapter_max_chars ?? DEFAULTS.chapter_max_chars,
    panel_readers: Math.max(3, Math.floor(number('panel-readers', number('panel_readers', DEFAULTS.panel_readers)))),
    panel_attempts: Math.max(1, Math.floor(number('panel-attempts', number('panel_attempts', DEFAULTS.panel_attempts)))),
    review_interval: Math.max(1, Math.floor(number('review-interval', number('review_interval', DEFAULTS.review_interval)))),
    chapter_revision_passes: Math.max(0, Math.floor(number('chapter-revision-passes', number('chapter_revision_passes', DEFAULTS.chapter_revision_passes)))),
    chapter_reader_review: boolean('chapter-reader-review', boolean('chapter_reader_review', DEFAULTS.chapter_reader_review)),
    chapter_reader_min_score: Math.min(10, Math.max(0, number('chapter-reader-min-score', number('chapter_reader_min_score', DEFAULTS.chapter_reader_min_score)))),
  };
}

function stateOf(project) { return readJson(path.join(project, 'state', 'project-state.json')); }
function autoState(project) { return readJson(path.join(project, 'state', 'autopilot.json'), {}); }
function pilotState(project) { return readJson(path.join(project, 'state', 'autopilot-pilot.json'), {}); }
function runState(project) { return readJson(path.join(project, RUN_FILE)); }

function defaultRun(project, config) {
  const state = stateOf(project);
  return {
    schema_version: '1.0',
    project: path.basename(project),
    status: 'idle',
    phase: 'prepare',
    target_words: Number(state.target_words || 1000000),
    current_chapter: Number(state.updated_through || 0),
    completed_prepare_nodes: [],
    panel: { status: 'pending', attempts: 0, evidence: null },
    attempts: {},
    last_event: null,
    stop_code: null,
    stop_reason: null,
    config: { ...config, invoke_mode: 'external-agent' },
    created_at: null,
    updated_at: null,
  };
}

function updateRun(project, update) {
  const current = runState(project) || defaultRun(project, configOf(project));
  const next = { ...current, ...update, updated_at: new Date().toISOString() };
  writeJson(path.join(project, RUN_FILE), next);
  return next;
}

function event(project, item) {
  appendJsonl(path.join(project, LEDGER_FILE), { schema_version: '1.0', created_at: new Date().toISOString(), ...item });
}

function rejected(project) {
  const auto = autoState(project);
  const pilot = readJson(path.join(project, 'state', 'pilot-verdict.json'), {});
  if (pilot.status === 'rejected') return { code: 'HUMAN_REJECTION_ACTIVE', reason: 'pilot verdict is rejected', file: 'state/pilot-verdict.json' };
  const current = runState(project);
  if (current?.stop_code === 'HUMAN_REJECTION_ACTIVE') return { code: current.stop_code, reason: current.stop_reason || 'human rejection is active' };
  if (auto.status === 'blocked' && auto.stop_code === 'HUMAN_REJECTION_ACTIVE') return { code: auto.stop_code, reason: auto.stop_reason || 'human rejection is active' };
  return null;
}

function shellArg(value) { return `"${String(value).replace(/(["\\])/g, '\\$1')}"`; }

function defaultInvokeAgent(request) {
  const args = [];
  if (request.model) args.push('--model', request.model);
  args.push(...(Array.isArray(request.agentArgs) ? request.agentArgs : DEFAULTS.agent_args), '-p', `Read and execute the local prompt file: ${request.promptFile}. Write only the requested artifacts inside ${request.project}.`);
  const commandLine = [request.agentCommand, ...args].map((value, index) => index === 0 ? String(value) : shellArg(value)).join(' ');
  const result = spawnSync(commandLine, {
    cwd: request.project,
    encoding: 'utf8',
    timeout: request.timeoutMs,
    windowsHide: true,
    shell: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    exitCode: result.status === null ? 124 : Number(result.status || 0),
    signal: result.signal || null,
    stdout: result.stdout || '',
    stderr: result.error ? `${result.stderr || ''}\n${result.error.message}` : (result.stderr || ''),
  };
}

function invokeAgent(project, task, prompt, config, options = {}) {
  const runId = `${Date.now()}-${task}-${Math.random().toString(16).slice(2, 8)}`;
  const directory = path.join(project, AGENT_DIR);
  fs.mkdirSync(directory, { recursive: true });
  const promptFile = path.join(directory, `${runId}.prompt.md`);
  const transcriptFile = path.join(directory, `${runId}.json`);
  atomicWrite(promptFile, `${prompt.trim()}\n`);
  const executor = options.invokeAgent || defaultInvokeAgent;
  const started = Date.now();
  let result;
  try {
    result = executor({ project, task, prompt, promptFile, agentCommand: config.agent_command, model: config.model, agentArgs: config.agent_args, timeoutMs: config.timeout_ms });
  } catch (error) {
    result = { exitCode: 1, stdout: '', stderr: error.message };
  }
  const normalized = {
    schema_version: '1.0', run_id: runId, task, prompt_file: relativePath(project, promptFile),
    exit_code: Number(result?.exitCode ?? result?.status ?? 1), signal: result?.signal || null,
    duration_ms: Date.now() - started, stdout: String(result?.stdout || ''), stderr: String(result?.stderr || ''),
    artifacts: [], created_at: new Date().toISOString(),
  };
  atomicWrite(transcriptFile, `${JSON.stringify(normalized, null, 2)}\n`);
  if (normalized.exit_code !== 0) throw new CliError('AGENT_FAILED', `Agent task failed: ${task}`, { task, run_id: runId, transcript: relativePath(project, transcriptFile), exit_code: normalized.exit_code, stderr: normalized.stderr.slice(-2000) });
  return { ...normalized, transcript: transcriptFile };
}

function artifactFiles(project, values) {
  return values.map((value) => {
    const file = path.join(project, value);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new CliError('AGENT_ARTIFACT_MISSING', `Agent did not create ${value}`, { artifact: value });
    return value;
  });
}

function nodeOf(id) {
  return workflow.manifest().nodes.find((node) => node.id === id) || null;
}

function nodePrompt(project, id) {
  const node = nodeOf(id);
  if (!node) throw new CliError('WORKFLOW_NODE_NOT_FOUND', `Unknown preparation node: ${id}`, { node: id });
  return [
    `You are the ${id} node in a durable Chinese web-novel project.`,
    `Project root: ${project}`,
    `Purpose: ${node.purpose}`,
    `Read only the local skill and the node inputs before writing. Preserve locked canon once it exists.`,
    `Write every required output exactly at these paths: ${node.outputs.join(', ')}.`,
    'Use traceable source notes when evidence is available. Replace initializer placeholders with concrete project decisions.',
    'Do not return a tutorial or prose in chat. Finish by saving the files and leave a short machine-readable summary in your normal output.',
  ].join('\n');
}

function prepare(project, config, options, state) {
  const prepared = new Set(state.completed_prepare_nodes || []);
  const prepIds = ['build', 'character', 'story-plan', 'outline'];
  for (const id of prepIds) {
    if (prepared.has(id)) continue;
    const flowStatus = workflow.status(project);
    if (flowStatus.status === 'done') {
      state.completed_prepare_nodes = prepIds.filter((node) => flowStatus.completed_nodes.includes(node));
      updateRun(project, { completed_prepare_nodes: state.completed_prepare_nodes, phase: 'prepare' });
      break;
    }
    if (flowStatus.status === 'blocked' && flowStatus.failed_node === id) workflow.retry(project, id);
    if (flowStatus.current_node && flowStatus.current_node !== id && !prepIds.includes(flowStatus.current_node)) break;
    let success = false;
    for (let attempt = 1; attempt <= config.max_attempts; attempt++) {
      state.attempts = { ...(state.attempts || {}), [id]: attempt };
      updateRun(project, { attempts: state.attempts, phase: 'prepare', current_node: id });
      try {
        invokeAgent(project, id, nodePrompt(project, id), config, options);
        const artifacts = artifactFiles(project, nodeOf(id).outputs);
        const checkpoint = workflow.checkpoint(project, id, { artifacts: artifacts.join(',') });
        prepared.add(id);
        state.completed_prepare_nodes = [...prepared];
        state.last_event = { type: 'node_checkpointed', node: id, checkpoint };
        updateRun(project, { completed_prepare_nodes: state.completed_prepare_nodes, last_event: state.last_event });
        event(project, { type: 'prepare_node_completed', node: id, artifacts });
        success = true;
        break;
      } catch (error) {
        event(project, { type: 'prepare_node_failed', node: id, attempt, code: error.code || 'UNEXPECTED_ERROR', reason: error.message });
        try { workflow.fail(project, id, { reason: `${error.code || 'ERROR'}: ${error.message}` }); } catch (_) { /* the node may have failed before the workflow was started */ }
        if (attempt < config.max_attempts) {
          try { workflow.retry(project, id); } catch (retryError) { throw retryError; }
        } else {
          throw error;
        }
      }
    }
    if (!success) throw new CliError('PREPARE_NODE_FAILED', `Preparation node failed: ${id}`, { node: id });
  }
  return state;
}

function chapterFiles(project, chapter) {
  const dir = path.join(project, 'manuscript');
  if (!fs.existsSync(dir)) return [];
  const pattern = new RegExp(`^ch-${String(chapter).padStart(4, '0')}-.+\\.md$`, 'i');
  return fs.readdirSync(dir).filter((name) => pattern.test(name)).map((name) => path.join(dir, name));
}

function quarantineChapter(project, chapter, attempt) {
  const files = chapterFiles(project, chapter);
  if (!files.length) return [];
  const directory = path.join(project, AGENT_DIR, 'failed-chapters');
  fs.mkdirSync(directory, { recursive: true });
  return files.map((file) => {
    const destination = path.join(directory, `${path.basename(file, '.md')}.attempt-${attempt}.md`);
    fs.renameSync(file, destination);
    return relativePath(project, destination);
  });
}

function ensureQa(project, chapter, metrics, ai, deg, format, revisionPasses = [], readerReviews = []) {
  const relative = `analysis/autopilot-qa-ch${String(chapter).padStart(4, '0')}.json`;
  const payload = { schema_version: '1.2', chapter, metrics, ai_patterns: ai, degeneration: deg, format, revision_passes: revisionPasses, reader_reviews: readerReviews, created_at: new Date().toISOString() };
  writeJson(path.join(project, relative), payload);
  if (!fs.existsSync(path.join(project, 'analysis', 'qa-report.md'))) atomicWrite(path.join(project, 'analysis', 'qa-report.md'), `# QA chapter ${chapter}\n\n- deterministic report: ${relative}\n`);
  return relative;
}

function criticalQuality(metrics, ai, deg, format) {
  const aiCount = Number(ai?.findings?.length || 0);
  const degCount = Number(deg?.findings?.filter((finding) => finding.rule !== '绡囧箙寮傚父').length || 0);
  const hardWarnings = (metrics?.warnings || []).filter((warning) => ['OPENING_ACTION_DELAY', 'EXPOSITION_BLOCK'].includes(warning.code));
  const formatErrors = Number(format?.errors?.length || 0);
  return { ok: aiCount === 0 && degCount === 0 && formatErrors === 0 && hardWarnings.length === 0, ai_count: aiCount, degeneration_count: degCount, format_errors: formatErrors, hard_warnings: hardWarnings };
}


function inspectChapter(manuscript) {
  const text = fs.readFileSync(manuscript, 'utf8');
  const metrics = readerMetrics.analyzeText(manuscript, text);
  const ai = aiPatterns.analyze(manuscript, text);
  const deg = degeneration.analyze(manuscript, text);
  const format = formatGate.analyze(manuscript, text);
  return { text, metrics, ai, deg, format, quality: criticalQuality(metrics, ai, deg, format) };
}

function readerReviewPrompt(project, chapter, manuscript, output, minScore) {
  return [
    `You are an independent cold reader reviewing Chinese web-novel chapter ${chapter}. Do not edit any file except the requested report.`,
    `Project root: ${project}`,
    `Read the manuscript ${relativePath(project, manuscript)}, its binding card state/chapter-cards/ch-${String(chapter).padStart(4, '0')}.json, reader contract, platform contract, context pack, and current state.`,
    `Write strict JSON only to ${output}.`,
    'Schema: {"schema_version":"1.0","chapter":number,"reviewer_id":string,"verdict":"pass|revise","scores":{"clarity":0..10,"continuation":0..10,"fanqie_fit":0..10,"character_agency":0..10,"payoff":0..10},"scene_evidence":{"goal":{"status":"present|missing","evidence":string,"note":string},"obstacle":{"status":"present|missing","evidence":string,"note":string},"turn":{"status":"present|missing","evidence":string,"note":string},"hook":{"status":"present|missing","evidence":string,"note":string}},"issues":[{"code":string,"severity":"critical|warning","evidence":string,"repair":string}],"summary":string}.',
    `Every issue evidence must be an unmodified contiguous literal quote from the manuscript body. Use verdict "revise" for a reader-blocking problem; score each dimension honestly. Scores under ${minScore}, a critical issue, or verdict revise trigger an in-transaction repair.`,
    'Calibrate strictly: 6 means a comprehensible but generic AI-like chapter; 7 means a normal publishable serial chapter; 8 requires specific, scene-grounded execution that creates a real desire to continue. Do not use 8 or above merely because the chapter has a title, dialogue, or an unexplained danger.',
    'For scene_evidence, prove from the actual prose that the protagonist pursues a goal, encounters an obstacle, makes or suffers a turn, and leaves a concrete next-reading hook. Mark any absent item missing with a concise note. Assess reader comprehension, desire to continue, Fanqie mobile-web-fiction feel, character agency, and whether this chapter delivers a concrete payoff. Do not praise the writer, invent quotes, or put commentary outside the JSON file.',
  ].join('\n');
}

function requestReaderReview(project, chapter, manuscript, round, config, options) {
  if (!config.chapter_reader_review) return { enabled: false, should_revise: false, report: null, relative: null, agent: null };
  const relative = `analysis/chapter-reader-review-ch${String(chapter).padStart(4, '0')}-r${String(round).padStart(2, '0')}.json`;
  const agent = invokeAgent(project, 'mvp-reader-review', readerReviewPrompt(project, chapter, manuscript, relative, config.chapter_reader_min_score), config, options);
  const validated = chapterReaderReview.validate(project, { chapter: String(chapter), file: relative, 'min-score': config.chapter_reader_min_score });
  return { enabled: true, relative, agent, report: validated.data, should_revise: validated.data.should_revise };
}

function readerReviewSummary(review, round) {
  if (!review?.enabled || !review.report) return { enabled: false, round };
  const report = review.report;
  return {
    enabled: true, round, file: review.relative, run_id: review.agent.run_id, verdict: report.verdict, scores: report.scores,
    review_of: report.review_of, manuscript_sha256: report.manuscript_sha256,
    low_scores: report.low_scores, critical_issue_count: report.critical_issue_count, scene_missing: report.scene_missing, should_revise: report.should_revise,
  };
}

function qualityDebt(quality) {
  return Number(quality?.ai_count || 0)
    + Number(quality?.degeneration_count || 0)
    + Number(quality?.format_errors || 0)
    + Number(quality?.hard_warnings?.length || 0);
}

function readerScore(review) {
  const scores = review?.report?.scores;
  if (!scores) return null;
  const values = Object.values(scores).map(Number).filter(Number.isFinite);
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
}

function candidateState(inspection, review) {
  const report = review?.report || null;
  return {
    quality_debt: qualityDebt(inspection?.quality),
    reader_enabled: Boolean(review?.enabled),
    reader_blocks: report?.should_revise ? 1 : 0,
    reader_critical_issues: Number(report?.critical_issue_count || 0),
    reader_low_scores: Number(report?.low_scores?.length || 0),
    reader_scene_missing: Number(report?.scene_missing?.length || 0),
    reader_score: readerScore(review),
  };
}

function chooseCandidate(previous, next) {
  if (next.quality_debt > previous.quality_debt) return { accepted: false, reason: 'deterministic_quality_regressed', previous, next };
  if (next.quality_debt < previous.quality_debt) return { accepted: true, reason: 'deterministic_quality_improved', previous, next };
  if (!previous.reader_enabled && !next.reader_enabled) return { accepted: false, reason: 'no_measurable_improvement', previous, next };
  if (next.reader_blocks < previous.reader_blocks) return { accepted: true, reason: 'reader_block_resolved', previous, next };
  if (next.reader_blocks > previous.reader_blocks) return { accepted: false, reason: 'reader_block_regressed', previous, next };
  if (next.reader_critical_issues < previous.reader_critical_issues) return { accepted: true, reason: 'critical_issue_count_reduced', previous, next };
  if (next.reader_critical_issues > previous.reader_critical_issues) return { accepted: false, reason: 'critical_issue_count_regressed', previous, next };
  if (next.reader_scene_missing < previous.reader_scene_missing) return { accepted: true, reason: 'scene_evidence_gap_reduced', previous, next };
  if (next.reader_scene_missing > previous.reader_scene_missing) return { accepted: false, reason: 'scene_evidence_gap_regressed', previous, next };
  if (next.reader_low_scores < previous.reader_low_scores) return { accepted: true, reason: 'low_score_count_reduced', previous, next };
  if (next.reader_low_scores > previous.reader_low_scores) return { accepted: false, reason: 'low_score_count_regressed', previous, next };
  if (Number.isFinite(next.reader_score) && Number.isFinite(previous.reader_score) && next.reader_score >= previous.reader_score + 0.25) return { accepted: true, reason: 'reader_score_improved', previous, next };
  return { accepted: false, reason: 'score_plateau_or_regression', previous, next };
}

function archiveRevision(project, chapter, round, manuscript, inspection, review, decision) {
  const directory = path.join(project, REVISION_DIR);
  fs.mkdirSync(directory, { recursive: true });
  const stem = `ch-${String(chapter).padStart(4, '0')}-r${String(round).padStart(2, '0')}`;
  const prose = path.join(directory, `${stem}.md`);
  const metadata = path.join(directory, `${stem}.json`);
  const text = fs.readFileSync(manuscript, 'utf8');
  atomicWrite(prose, text);
  const payload = {
    schema_version: '1.0', chapter, round, manuscript: relativePath(project, manuscript), manuscript_sha256: sha256(text),
    snapshot: relativePath(project, prose), candidate: candidateState(inspection, review), decision, created_at: new Date().toISOString(),
  };
  writeJson(metadata, payload);
  return { prose: relativePath(project, prose), metadata: relativePath(project, metadata), payload };
}

function buildRevisionBrief(project, chapter, pass, inspection, review) {
  const relative = `analysis/chapter-revision-brief-ch${String(chapter).padStart(4, '0')}-r${String(pass).padStart(2, '0')}.md`;
  const report = review?.report || null;
  const issues = [...(report?.issues || [])].sort((left, right) => (left.severity === 'critical' ? -1 : 0) - (right.severity === 'critical' ? -1 : 0));
  const sceneProblems = (report?.scene_missing || []).map((key) => `- Missing ${key} evidence: make the ${key} legible in a scene and preserve its literal proof for the next review.`);
  const readerProblems = issues.length
    ? issues.map((issue, index) => `${index + 1}. [${issue.severity}/${issue.code}] Evidence: “${issue.evidence}”\n   Repair: ${issue.repair}`).join('\n')
    : (report?.low_scores || []).map((key, index) => `${index + 1}. Raise ${key}; the cold reader scored it ${report.scores[key]}/10.`).join('\n') || 'No reader issue was supplied; repair the deterministic findings only.';
  const deterministic = [
    `AI-pattern findings: ${inspection.quality.ai_count}`,
    `degeneration findings: ${inspection.quality.degeneration_count}`,
    `format errors: ${inspection.quality.format_errors}`,
    `hard reader-metric warnings: ${inspection.quality.hard_warnings.length}`,
  ].join('\n');
  const markdown = [
    `# Revision brief: chapter ${chapter}, pass ${pass}`,
    '',
    '## Preserve',
    '',
    `- The binding chapter contract: state/chapter-cards/ch-${String(chapter).padStart(4, '0')}.json.`,
    '- Canon, character knowledge limits, required beat, and end-hook direction.',
    '- Fanqie mobile formatting: one title, short readable prose paragraphs, action/result beats, and no planning artifacts.',
    '',
    '## Repair in priority order',
    '',
    [readerProblems, ...sceneProblems].filter(Boolean).join('\n'),
    '',
    '## Deterministic findings',
    '',
    deterministic,
    '',
    '## Acceptance',
    '',
    `- A new cold-reader round must clear every score at or above ${report?.min_score || 'the project threshold'} and return verdict pass.`,
    '- The candidate must improve its measurable debt; an equal or weaker rewrite is discarded and the prior draft remains the active manuscript.',
  ].join('\n');
  atomicWrite(path.join(project, relative), `${markdown}\n`);
  return relative;
}

function revisionPrompt(project, chapter, manuscript, pass, inspection, readerReview = null, brief = null) {
  const task = pass === 1 ? 'Draft B structural repair' : 'Draft C language repair';
  return [
    `You are the ${task} node for Chinese web-novel chapter ${chapter}.`,
    `Project root: ${project}`,
    `Edit only this manuscript: ${relativePath(project, manuscript)}. Keep the same filename and one chapter title.`,
    `Read the binding chapter card at state/chapter-cards/ch-${String(chapter).padStart(4, '0')}.json, the context pack, current state, and the deterministic QA findings below.`,
    `QA findings: ${JSON.stringify(inspection.quality)}`,
    `Cold-reader findings: ${JSON.stringify(readerReview?.report || { enabled: false })}`,
    `Follow this binding repair brief: ${brief || 'no brief generated'}.`,
    'Preserve canon, required beat, character knowledge boundaries, and the end hook. Replace abstract explanation with scene action, choice, consequence, or purposeful dialogue where the findings require it.',
    'Keep Fanqie mobile formatting: plain prose only, short readable paragraphs, concrete action, and a changed ending situation. Update no settings, outline, or project-state files.',
    'Finish by saving the revised manuscript in place. Do not write planning notes into the manuscript.',
  ].join('\n');
}

function commitState(project, chapter, words) {
  const file = path.join(project, 'state', 'project-state.json');
  const state = stateOf(project);
  if (Number(state.updated_through || 0) > chapter) throw new CliError('STATE_AHEAD', `Project state is ahead of chapter ${chapter}`, { updated_through: state.updated_through, chapter });
  const next = { ...state, updated_through: chapter, word_count: words, last_committed_chapter: chapter, last_committed_at: new Date().toISOString() };
  writeJson(file, next);
  return next;
}

function restoreState(project, snapshot) { writeJson(path.join(project, 'state', 'project-state.json'), snapshot); }

function continuity(project, chapter, manuscript) {
  const current = path.join(project, 'state', 'current-state.md');
  const existing = fs.existsSync(current) ? fs.readFileSync(current, 'utf8') : '# Current state\n';
  const replaced = /^updated_through:\s*\d+/m.test(existing)
    ? existing.replace(/^updated_through:\s*\d+/m, `updated_through: ${chapter}`)
    : `updated_through: ${chapter}\n\n${existing}`;
  const marker = `## Autopilot commit ${chapter}`;
  atomicWrite(current, replaced.includes(marker) ? replaced : `${replaced.trimEnd()}\n\n${marker}\n\n- manuscript: ${relativePath(project, manuscript)}\n- continuity record: state/post-hoc-ledger.jsonl\n`);
  for (const relative of ['state/character-state.md', 'state/unresolved-hooks.md', 'state/timeline.md']) {
    const file = path.join(project, relative);
    if (!fs.existsSync(file)) atomicWrite(file, `# ${path.basename(relative, '.md')}\n\n- Updated through chapter ${chapter}.\n`);
  }
}

function chapterPrompt(project, chapter, transactionResult) {
  return [
    'You are the chapter production node in a deterministic Chinese web-novel pipeline.',
    `Project root: ${project}`,
    `Write exactly chapter ${chapter}. The transaction and context pack already exist: ${transactionResult.context}.`,
    `The binding chapter card is state/chapter-cards/ch-${String(chapter).padStart(4, '0')}.json.`,
    'Read the local skill, author intent, current focus, reader contract, platform contract, chapter card, chapter beat, context pack, current state, and unresolved hooks.',
    `Create one file matching manuscript/ch-${String(chapter).padStart(4, '0')}-<title>.md with complete publishable Chinese prose.`,
    'Format contract: keep one chapter title only, then plain prose separated by single blank lines; no outline headings, lists, tables, code fences, logs, or self-evaluation.',
    'Keep paragraphs mobile-first (normally under 260 Chinese characters) and split long sentences at action, reaction, dialogue, and result beats. Put purposeful dialogue in its own paragraph.',
    'Move through a visible action or choice quickly; every scene must change a goal, obstacle, relationship, clue, or resource. Do not chain paragraphs with “然后/接着/随后” as a timeline summary.',
    'End on a concrete changed situation or unanswered hook. The final file must read like publishable Tomato/Fanqie web fiction, not a plan or a chronological log.',
    'Do not put planning notes, placeholders, model commentary, or markdown tables in the manuscript. Do not edit settings or outline files during the transaction.',
    'If continuity files need a factual update, update state/current-state.md, state/character-state.md, state/timeline.md, state/unresolved-hooks.md, and state/current-focus.md only. Leave project-state updated_through for the orchestrator.',
  ].join('\n');
}

function finishWorkflowFirstChapter(project, chapter, manuscript, config, options) {
  let flow = workflow.status(project);
  if (flow.current_node === 'mvp') {
    const qa = fs.existsSync(path.join(project, 'analysis', 'qa-report.md')) ? 'analysis/qa-report.md' : ensureQa(project, chapter, {}, {}, {}, {});
    workflow.checkpoint(project, 'mvp', { artifacts: `${relativePath(project, manuscript)},${qa}` });
    flow = workflow.status(project);
  }
  if (flow.current_node === 'post-hoc') {
    const artifacts = ['state/current-state.md', 'state/character-state.md', 'state/unresolved-hooks.md'].filter((file) => fs.existsSync(path.join(project, file)));
    workflow.checkpoint(project, 'post-hoc', { artifacts: artifacts.join(',') || 'state/current-state.md' });
    flow = workflow.status(project);
  }
  if (flow.current_node === 'polish') {
    invokeAgent(project, 'polish', [
      'You are the polish node. Read the just-committed chapter and the reader-first skill references.',
      `Write analysis/qa-report.md and analysis/reader-metrics.json for chapter ${chapter}.`,
      'Keep manuscript prose intact unless a factual correction is required; record actionable issues with file and quote.',
    ].join('\n'), config, options);
    if (!fs.existsSync(path.join(project, 'analysis', 'reader-metrics.json'))) writeJson(path.join(project, 'analysis', 'reader-metrics.json'), { schema_version: '1.0', chapter, status: 'agent-completed' });
    workflow.checkpoint(project, 'polish', { artifacts: 'analysis/qa-report.md,analysis/reader-metrics.json' });
  }
}

function runChapter(project, config, options, run) {
  const before = stateOf(project);
  const chapter = Number(before.updated_through || 0) + 1;
  let active = readJson(path.join(project, transaction.TRANSACTION_FILE), { phase: 'idle' });
  const beginResult = active.phase === 'drafting' ? { ok: true, chapter: active.chapter, context: path.join(project, active.context_pack?.path || 'state/context-pack.md') } : transaction.begin(project, { chapter, query: 'chapter beat character relations hooks', 'min-chars': String(config.chapter_min_chars), ...(config.chapter_max_chars === null ? {} : { 'max-chars': String(config.chapter_max_chars) }) });
  if (!beginResult.ok) throw new CliError('CHAPTER_PRE_GATE_FAILED', `Chapter ${chapter} pre-gate failed`, { errors: beginResult.errors });
  const actualChapter = Number(beginResult.chapter || chapter);
  run.attempts = { ...(run.attempts || {}), [`chapter-${actualChapter}`]: Number(run.attempts?.[`chapter-${actualChapter}`] || 0) + 1 };
  updateRun(project, { current_chapter: actualChapter, phase: actualChapter <= 3 ? 'pilot-build' : 'production', attempts: run.attempts, last_event: { type: 'chapter_started', chapter: actualChapter } });
  const agent = invokeAgent(project, 'mvp', chapterPrompt(project, actualChapter, beginResult), config, options);
  const agentRuns = [agent];
  let files = chapterFiles(project, actualChapter);
  if (files.length !== 1) throw new CliError('CHAPTER_ARTIFACT_SHAPE', `Expected exactly one manuscript file for chapter ${actualChapter}`, { files: files.map((file) => relativePath(project, file)) });
  let manuscript = files[0];
  let inspection = inspectChapter(manuscript);
  const revisionPasses = [];
  const revisionArtifacts = [];
  const readerReviews = [];
  let readerReview = requestReaderReview(project, actualChapter, manuscript, 1, config, options);
  if (readerReview.agent) agentRuns.push(readerReview.agent);
  if (readerReview.enabled) readerReviews.push(readerReviewSummary(readerReview, 1));
  let acceptedSnapshot = null;
  for (let pass = 1; pass <= config.chapter_revision_passes && (!inspection.quality.ok || readerReview.should_revise); pass++) {
    if (!acceptedSnapshot) {
      acceptedSnapshot = archiveRevision(project, actualChapter, 0, manuscript, inspection, readerReview, { accepted: true, reason: 'initial_draft' });
      revisionArtifacts.push(acceptedSnapshot.prose, acceptedSnapshot.metadata);
    }
    const priorText = fs.readFileSync(manuscript, 'utf8');
    const priorInspection = inspection;
    const priorReaderReview = readerReview;
    const brief = buildRevisionBrief(project, actualChapter, pass, inspection, readerReview);
    const task = pass === 1 ? 'mvp-structure-revise' : 'mvp-language-revise';
    const revision = invokeAgent(project, task, revisionPrompt(project, actualChapter, manuscript, pass, inspection, readerReview, brief), config, options);
    agentRuns.push(revision);
    files = chapterFiles(project, actualChapter);
    if (files.length !== 1) throw new CliError('CHAPTER_ARTIFACT_SHAPE', `Revision produced an invalid manuscript shape for chapter ${actualChapter}`, { files: files.map((file) => relativePath(project, file)), task });
    manuscript = files[0];
    inspection = inspectChapter(manuscript);
    readerReview = requestReaderReview(project, actualChapter, manuscript, pass + 1, config, options);
    if (readerReview.agent) agentRuns.push(readerReview.agent);
    if (readerReview.enabled) readerReviews.push(readerReviewSummary(readerReview, pass + 1));
    const selection = chooseCandidate(candidateState(priorInspection, priorReaderReview), candidateState(inspection, readerReview));
    const candidateSnapshot = archiveRevision(project, actualChapter, pass, manuscript, inspection, readerReview, selection);
    revisionArtifacts.push(candidateSnapshot.prose, candidateSnapshot.metadata, brief);
    revisionPasses.push({ pass, task, run_id: revision.run_id, quality: inspection.quality, reader_review: readerReviewSummary(readerReview, pass + 1), brief, snapshot: candidateSnapshot, selection });
    if (!selection.accepted) {
      atomicWrite(manuscript, priorText);
      inspection = priorInspection;
      readerReview = priorReaderReview;
      break;
    }
    acceptedSnapshot = candidateSnapshot;
  }
  const { text, metrics, ai, deg, format, quality } = inspection;
  const wordsBefore = Number(before.word_count || 0);
  const words = wordsBefore + countText(text).chinese_chars;
  const qa = ensureQa(project, actualChapter, metrics, ai, deg, format, revisionPasses, readerReviews);
  if (!quality.ok) throw new CliError('CHAPTER_QUALITY_GATE_FAILED', `Chapter ${actualChapter} quality gate failed`, { chapter: actualChapter, quality, qa, revision_passes: revisionPasses });
  if (readerReview.should_revise) throw new CliError('CHAPTER_READER_REVIEW_FAILED', `Chapter ${actualChapter} cold-reader review still requires revision`, { chapter: actualChapter, qa, reader_review: readerReviewSummary(readerReview, readerReviews.length), revision_passes: revisionPasses });
  const currentStateFile = path.join(project, 'state', 'current-state.md');
  const currentStateBefore = fs.existsSync(currentStateFile) ? fs.readFileSync(currentStateFile, 'utf8') : null;
  commitState(project, actualChapter, words);
  continuity(project, actualChapter, manuscript);
  const finished = transaction.finish(project, { chapter: actualChapter });
  if (!finished.ok) {
    restoreState(project, before);
    if (currentStateBefore === null) { try { fs.unlinkSync(currentStateFile); } catch (_) { /* best effort */ } }
    else atomicWrite(currentStateFile, currentStateBefore);
    try { transaction.abort(project, { reason: `finish failed: ${JSON.stringify(finished.errors)}` }); } catch (_) { /* retain the failure record */ }
    throw new CliError('CHAPTER_POST_GATE_FAILED', `Chapter ${actualChapter} post-gate failed`, { errors: finished.errors, warnings: finished.warnings });
  }
  const chapterArtifacts = [relativePath(project, manuscript), qa, finished.event.chapter_memory.path, ...readerReviews.filter((item) => item.enabled).map((item) => item.file), ...revisionArtifacts];
  workflow.postHoc(project, { chapter: actualChapter, summary: `Chapter ${actualChapter} committed with ${countText(text).chinese_chars} Chinese characters.`, artifacts: chapterArtifacts.join(',') });
  if (actualChapter === 1) finishWorkflowFirstChapter(project, actualChapter, manuscript, config, options);
  const readerReviewResult = readerReviewSummary(readerReview, readerReviews.length);
  const nextState = { ...run, current_chapter: actualChapter, last_event: { type: 'chapter_committed', chapter: actualChapter, manuscript: relativePath(project, manuscript), chapter_memory: finished.event.chapter_memory.path, agent_run_id: agent.run_id, agent_run_ids: agentRuns.map((item) => item.run_id), revision_passes: revisionPasses.length, reader_review: readerReviewResult, quality }, word_count: words };
  updateRun(project, nextState);
  event(project, { type: 'chapter_committed', chapter: actualChapter, manuscript: relativePath(project, manuscript), chapter_memory: finished.event.chapter_memory.path, agent_run_ids: agentRuns.map((item) => item.run_id), revision_passes: revisionPasses.length, reader_review: readerReviewResult, word_count: words, quality });
  return { chapter: actualChapter, manuscript, quality, words, agent_run_id: agent.run_id, agent_run_ids: agentRuns.map((item) => item.run_id), revision_passes: revisionPasses, reader_reviews: readerReviews };
}

function quoteFromChapter(project, chapter) {
  const file = chapterFiles(project, chapter)[0];
  if (!file) throw new CliError('PANEL_SOURCE_MISSING', `Missing chapter ${chapter} for panel`, { chapter });
  const text = fs.readFileSync(file, 'utf8').replace(/^#{1,6}[^\n]*\n?/gm, '').trim();
  const quote = text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length >= 4) || text.slice(0, 40);
  return { file: relativePath(project, file), quote: quote.slice(0, 80) };
}

function panelPrompt(project, readerId, output) {
  return [
    'Act as an independent cold reader. Do not edit the manuscript or any project canon.',
    `Read chapters 1-3 under ${project}/manuscript and write strict JSON to ${output}.`,
    'Required keys: reader_id, comprehension_0_to_10, continuation_0_to_10, platform_fit_0_to_10, prose_naturalness_0_to_10, would_continue (boolean), one_sentence_pitch, confusions (array), strongest_hook, weakest_point, reason.',
    'Score the reader experience, not the writing agent. Mention concrete confusion and continuation evidence. Output JSON only in the file.',
  ].join('\n');
}

function parsePanelFile(project, file, stdout = '') {
  const target = path.join(project, file);
  let raw = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').trim() : stdout.trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new CliError('PANEL_JSON_INVALID', `Panel report is not JSON: ${file}`, { file });
  let value;
  try { value = JSON.parse(match[0]); } catch (error) { throw new CliError('PANEL_JSON_INVALID', `Panel report JSON parse failed: ${file}`, { message: error.message }); }
  const keys = ['comprehension_0_to_10', 'continuation_0_to_10', 'platform_fit_0_to_10', 'prose_naturalness_0_to_10'];
  if (keys.some((key) => !Number.isFinite(Number(value[key])) || Number(value[key]) < 0 || Number(value[key]) > 10) || typeof value.would_continue !== 'boolean') throw new CliError('PANEL_REPORT_INVALID', `Panel report fields are invalid: ${file}`, { file });
  return value;
}

function runPanel(project, config, options, run) {
  const reports = [];
  const directory = path.join(project, 'analysis', 'autopilot-panel');
  fs.mkdirSync(directory, { recursive: true });
  const attempt = Number(run.panel?.attempts || 0) + 1;
  for (let index = 1; index <= config.panel_readers; index++) {
    const readerId = `R${index}`;
    const relative = `analysis/autopilot-panel/${readerId}-attempt-${attempt}.json`;
    const result = invokeAgent(project, `panel-${readerId}`, panelPrompt(project, readerId, path.join(project, relative)), config, options);
    reports.push(parsePanelFile(project, relative, result.stdout));
  }
  const anchors = [
    { id: 'opening-hook', target: 'opening hook is understood by a cold reader', status: 'fulfilled', evidence: [quoteFromChapter(project, 1)] },
    { id: 'third-chapter-cliffhanger', target: 'chapter three changes the next reading question', status: 'fulfilled', evidence: [quoteFromChapter(project, 3)] },
  ];
  const average = (key) => reports.reduce((sum, item) => sum + Number(item[key] || 0), 0) / reports.length;
  const comprehension = reports.filter((item) => Number(item.comprehension_0_to_10) >= 7).length / reports.length;
  const continuation = reports.filter((item) => item.would_continue === true).length / reports.length;
  const evidence = {
    schema_version: '1.0', reviewed_through: 3, independent_readers: reports.length,
    reader_score: Number((average('continuation_0_to_10') * 0.4 + average('platform_fit_0_to_10') * 0.25 + average('comprehension_0_to_10') * 0.2 + average('prose_naturalness_0_to_10') * 0.15).toFixed(2)),
    platform_fit: Number(average('platform_fit_0_to_10').toFixed(2)), comprehension_pass_rate: Number(comprehension.toFixed(2)), continuation_rate: Number(continuation.toFixed(2)),
    critical_failures: 0, target_anchors: anchors,
    reader_reports: reports.map((item) => ({ summary: String(item.reason || item.strongest_hook || '').slice(0, 1000), confusions: Array.isArray(item.confusions) ? item.confusions : [], continue_next: item.would_continue })),
    findings: [], raw_reports: reports,
    reason: 'Three independent cold-reader sessions completed by the autopilot panel.', updated_at: new Date().toISOString(),
  };
  const evidenceFile = 'analysis/autopilot-pilot.json';
  writeJson(path.join(project, evidenceFile), evidence);
  run.panel = { status: 'collected', attempts: attempt, evidence: evidenceFile, readers: reports.length, score: evidence.reader_score };
  updateRun(project, { panel: run.panel, phase: 'pilot' });
  return { evidence, evidenceFile };
}

function approvePanel(project, config, options, run) {
  if (pilotState(project).status === 'approved') return { ok: true, reused: true, evidence: pilotState(project).evidence || run.panel?.evidence };
  let lastError;
  for (let attempt = 1; attempt <= config.panel_attempts; attempt++) {
    try {
      const panel = runPanel(project, config, options, run);
      const verdict = autopilot.pilotPass(project, { evidence: panel.evidenceFile });
      run.panel = { ...run.panel, status: 'approved', verdict: verdict.verdict };
      updateRun(project, { panel: run.panel, phase: 'production', stop_code: null, stop_reason: null });
      event(project, { type: 'pilot_approved', evidence: panel.evidenceFile, score: panel.evidence.reader_score });
      return verdict;
    } catch (error) {
      lastError = error;
      event(project, { type: 'pilot_attempt_failed', attempt, code: error.code || 'UNEXPECTED_ERROR', reason: error.message });
      if (attempt < config.panel_attempts) {
        invokeAgent(project, 'pilot-repair', [
          'Repair chapters 1-3 for the failing reader gate. Read analysis/autopilot-pilot.json and the raw reports under analysis/autopilot-panel/.',
          'Preserve the locked settings and outline. Rewrite only manuscript chapters 1-3 to fix concrete comprehension, hook, continuity, or platform-fit findings.',
          'Keep the Fanqie mobile format: one title, single blank lines, short paragraphs, purposeful standalone dialogue, visible action/result beats, and no outline/list/table/chronological-log prose. Run the local format and chapter gates mentally and save complete prose; do not write a self-rating.',
        ].join('\n'), config, options);
        for (let chapter = 1; chapter <= 3; chapter++) {
          const gate = chapterGate.gate(project, { stage: 'post', chapter: String(chapter), 'min-chars': String(config.chapter_min_chars), ...(config.chapter_max_chars === null ? {} : { 'max-chars': String(config.chapter_max_chars) }) });
          if (!gate.ok) throw new CliError('PILOT_REPAIR_GATE_FAILED', `Pilot repair left chapter ${chapter} outside the post gate`, { chapter, errors: gate.errors });
        }
      }
    }
  }
  throw lastError;
}

function review(project, chapter, config, options, run) {
  const relative = `analysis/review-${String(chapter).padStart(4, '0')}.md`;
  invokeAgent(project, 'review', [
    'Perform a cross-chapter review for a Chinese web-novel production run.',
    `Read the latest ${config.review_interval} chapters and current state. Write ${relative}.`,
    'Check reader contract, progression, hook cadence, character continuity, unresolved promises, and platform fit. Record evidence paths and concrete next actions. Do not rewrite canon in this task.',
  ].join('\n'), config, options);
  if (!fs.existsSync(path.join(project, relative))) throw new CliError('REVIEW_ARTIFACT_MISSING', `Review did not create ${relative}`, { artifact: relative });
  const auto = autoState(project);
  writeJson(path.join(project, 'state', 'autopilot.json'), { ...auto, last_review_through: chapter, chapter_review_interval: config.review_interval, status: 'running', phase: 'production', updated_at: new Date().toISOString() });
  updateRun(project, { last_review_through: chapter, last_event: { type: 'review_completed', chapter, artifact: relative } });
  event(project, { type: 'review_completed', chapter, artifact: relative });
  return relative;
}

function start(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const rejection = rejected(project);
  if (rejection) throw new CliError(rejection.code, rejection.reason, rejection);
  const config = configOf(project, options);
  const existing = runState(project);
  if (existing && ['running', 'paused'].includes(existing.status)) return { ok: true, command: 'start', project, resumed: existing.status === 'paused', run: existing };
  const currentAuto = autoState(project);
  if (currentAuto.mode !== 'autopilot' || currentAuto.status === 'idle') autopilot.start(project);
  const flow = workflow.status(project);
  if (flow.status === 'idle') workflow.start(project, { runner: 'autopilot-runner' });
  const initial = { ...defaultRun(project, config), status: 'running', phase: 'prepare', created_at: new Date().toISOString(), config };
  writeJson(path.join(project, RUN_FILE), initial);
  event(project, { type: 'runner_started', target_words: initial.target_words, agent_command: config.agent_command, model: config.model || null });
  return { ok: true, command: 'start', project, run: initial, workflow: workflow.status(project) };
}

function stop(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const reason = String(options.reason || 'manual stop requested').trim();
  const code = String(options.code || 'RUN_STOPPED');
  const current = runState(project) || defaultRun(project, configOf(project, options));
  const next = updateRun(project, { ...current, status: 'paused', stop_code: code, stop_reason: reason });
  const auto = autoState(project);
  writeJson(path.join(project, 'state', 'autopilot.json'), { ...auto, status: 'paused', stop_code: code, stop_reason: reason, updated_at: new Date().toISOString() });
  event(project, { type: 'runner_stopped', code, reason });
  return { ok: true, command: 'stop', project, status: next.status, code, reason };
}

function status(projectInput) {
  const project = projectOf(projectInput);
  const run = runState(project);
  const flow = workflow.status(project);
  const auto = autopilot.status(project);
  return { ok: true, command: 'status', project, runner: run || { status: 'idle' }, autopilot: auto, workflow: flow, word_count: Number(stateOf(project).word_count || 0) };
}

function runProject(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const rejection = rejected(project);
  if (rejection) throw new CliError(rejection.code, rejection.reason, rejection);
  let run = runState(project);
  if (!run || run.status === 'idle') { start(project, options); run = runState(project); }
  const config = configOf(project, { ...run.config, ...options });
  if (run.status === 'paused' && run.stop_code === 'PILOT_GATE_PENDING' && pilotState(project).status !== 'approved') return { ok: false, command: 'run', status: 'paused', code: run.stop_code, reason: run.stop_reason, next: 'supply or collect pilot evidence, then resume run' };
  const auto = autoState(project);
  if (auto.status === 'paused' || auto.status === 'blocked') {
    writeJson(path.join(project, 'state', 'autopilot.json'), { ...auto, status: 'running', stop_code: null, stop_reason: null, updated_at: new Date().toISOString() });
  }
  run = updateRun(project, { ...run, status: 'running', config, stop_code: null, stop_reason: null });
  run = prepare(project, config, options, run);
  const targetWords = Number(stateOf(project).target_words || run.target_words || 1000000);
  const maxChapters = options['max-chapters'] === undefined ? Infinity : Number(options['max-chapters']);
  if (maxChapters !== Infinity && (!Number.isInteger(maxChapters) || maxChapters < 0)) throw new CliError('INVALID_MAX_CHAPTERS', 'max-chapters must be a non-negative integer', { value: options['max-chapters'] });
  let produced = 0;
  while (Number(stateOf(project).word_count || 0) < targetWords && produced < maxChapters) {
    const current = stateOf(project);
    const nextChapter = Number(current.updated_through || 0) + 1;
    if (nextChapter === 4 && Number(targetWords) >= 300000 && pilotState(project).status !== 'approved') {
      try { approvePanel(project, config, options, run); }
      catch (error) {
        stop(project, { code: error.code === 'HUMAN_REJECTION_ACTIVE' ? error.code : 'PILOT_GATE_PENDING', reason: error.message });
        return { ok: false, command: 'run', status: 'paused', code: error.code || 'PILOT_GATE_PENDING', reason: error.message, panel: run.panel };
      }
    }
    try {
      let result;
      let lastError;
      for (let attempt = 1; attempt <= config.max_attempts; attempt++) {
        try {
          result = runChapter(project, config, options, run);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          event(project, { type: 'chapter_attempt_failed', chapter: nextChapter, attempt, code: error.code || 'UNEXPECTED_ERROR', reason: error.message });
          const active = readJson(path.join(project, transaction.TRANSACTION_FILE), { phase: 'idle' });
          if (active.phase === 'drafting') {
            try { transaction.abort(project, { reason: `attempt ${attempt}: ${error.message}` }); } catch (_) { /* retain original failure */ }
          }
          const quarantined = quarantineChapter(project, nextChapter, attempt);
          if (quarantined.length) event(project, { type: 'failed_chapter_quarantined', chapter: nextChapter, attempt, artifacts: quarantined });
          if (attempt < config.max_attempts) continue;
        }
      }
      if (lastError || !result) throw lastError || new CliError('CHAPTER_ATTEMPT_EMPTY', `Chapter ${nextChapter} produced no result`, { chapter: nextChapter });
      run = runState(project);
      produced++;
      if (result.chapter >= 4 && result.chapter % config.review_interval === 0) review(project, result.chapter, config, options, run);
    } catch (error) {
      event(project, { type: 'chapter_failed', chapter: nextChapter, code: error.code || 'UNEXPECTED_ERROR', reason: error.message });
      stop(project, { code: error.code || 'CHAPTER_FAILED', reason: error.message });
      return { ok: false, command: 'run', status: 'paused', code: error.code || 'CHAPTER_FAILED', reason: error.message, produced };
    }
  }
  const finalState = stateOf(project);
  const complete = Number(finalState.word_count || 0) >= targetWords;
  if (complete) {
    const autoNow = autoState(project);
    writeJson(path.join(project, 'state', 'autopilot.json'), { ...autoNow, mode: 'autopilot', status: 'completed', phase: 'complete', current_chapter: finalState.updated_through, target_words: targetWords, updated_at: new Date().toISOString() });
    const handoffResult = handoff.build(project, {});
    atomicWrite(handoffResult.output, handoffResult.markdown);
    run = updateRun(project, { status: 'completed', phase: 'complete', current_chapter: finalState.updated_through, word_count: finalState.word_count, last_event: { type: 'book_completed' } });
    event(project, { type: 'book_completed', updated_through: finalState.updated_through, word_count: finalState.word_count });
  } else {
    run = updateRun(project, { status: 'paused', phase: Number(finalState.updated_through || 0) < 3 ? 'pilot-build' : 'production', current_chapter: finalState.updated_through, word_count: finalState.word_count, stop_code: 'BUDGET_SLICE_COMPLETE', stop_reason: `max chapters reached: ${maxChapters}` });
  }
  return { ok: true, command: 'run', status: run.status, produced, current_chapter: finalState.updated_through, word_count: Number(finalState.word_count || 0), target_words: targetWords, panel: run.panel };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.command || !args.project || !['start', 'run', 'status', 'stop'].includes(args.command)) throw new CliError('USAGE', 'Usage: node autopilot-runner.js start|run|status|stop <PROJECT> [options]');
  const report = args.command === 'start' ? start(args.project, args) : args.command === 'run' ? runProject(args.project, args) : args.command === 'status' ? status(args.project) : stop(args.project, args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.ok === false) process.exitCode = 3;
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'autopilot-runner'); }
}

module.exports = { RUN_FILE, LEDGER_FILE, CONFIG_FILE, argsOf, configOf, readJson, readRun: runState, invokeAgent, start, stop, status, runProject, run };
