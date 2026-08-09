#!/usr/bin/env node
'use strict';

/*
 * Preserves the failed review history hidden behind a later accepted revision.
 * Quality trend answers "how did committed chapters feel?"; this script answers
 * "what does the production loop keep having to repair?".
 */
const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const LEDGER_FILE = 'state/repair-debt-ledger.json';
const GUIDANCE_FILE = 'state/repair-debt-guidance.json';
const ROOT_CAUSES = ['repair_loop', 'contract_delivery', 'diagnostic_drift', 'budget_exhausted', 'unknown'];
const DELIVERY_KEYS = new Set(['scene:goal', 'scene:obstacle', 'scene:turn', 'scene:payoff', 'scene:hook', 'editorial:causal_chain', 'editorial:outline_delivery', 'editorial:next_read_boundary']);

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
function average(values) { return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null; }
function unique(values) { return [...new Set(values.filter(Boolean))].sort(); }

function projectOf(input) {
  const project = path.resolve(input || '');
  if (!input || !fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', 'Project directory not found', { project });
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  return project;
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (_) { return fallback; }
}

function revisionBudget(project) {
  const settings = readJson(path.join(project, 'settings', 'agent-runner.json'), {});
  const value = Number(settings?.chapter_revision_passes);
  return Number.isInteger(value) && value >= 0 ? value : 2;
}

function reviewFiles(project, options = {}) {
  const start = Number.parseInt(options.start || options.from || '1', 10);
  const end = options.end === undefined && options.to === undefined ? Infinity : Number.parseInt(options.end || options.to, 10);
  if (!Number.isInteger(start) || start <= 0 || !(end === Infinity || (Number.isInteger(end) && end >= start))) throw new CliError('INVALID_RANGE', 'start/end must form a positive chapter range', { start: options.start || options.from, end: options.end || options.to });
  const directory = path.join(project, 'analysis');
  const warnings = [];
  const groups = new Map();
  const pattern = /^chapter-reader-review-ch(\d{4})-r(\d{2})\.json$/i;
  const names = fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
  for (const name of names) {
    const match = name.match(pattern);
    if (!match) continue;
    const chapter = Number(match[1]);
    if (chapter < start || chapter > end) continue;
    const file = path.join(directory, name);
    const report = readJson(file);
    if (!report || typeof report !== 'object' || Array.isArray(report)) {
      warnings.push({ code: 'REPAIR_DEBT_REPORT_INVALID', file: normal(path.relative(project, file)) });
      continue;
    }
    const item = { chapter, round: Number(match[2]), file: normal(path.relative(project, file)), report };
    groups.set(chapter, [...(groups.get(chapter) || []), item]);
  }
  return { groups, warnings, start, end };
}

function debtKeys(report) {
  return unique([
    ...(Array.isArray(report?.issues) ? report.issues.map((item) => `issue:${String(item?.code || '').trim()}`) : []),
    ...(Array.isArray(report?.low_scores) ? report.low_scores.map((item) => `score:${String(item || '').trim()}`) : []),
    ...(Array.isArray(report?.scene_missing) ? report.scene_missing.map((item) => `scene:${String(item || '').trim()}`) : []),
    ...(Array.isArray(report?.feedback_rule_failures) ? report.feedback_rule_failures.map((item) => `feedback:${String(item || '').trim()}`) : []),
    ...(Array.isArray(report?.style_signal_failures) ? report.style_signal_failures.map((item) => `style:${String(item || '').trim()}`) : []),
    ...(Array.isArray(report?.character_contract_failures) ? report.character_contract_failures.map((item) => `character:${String(item || '').trim()}`) : []),
    ...(Array.isArray(report?.editorial_dimension_failures) ? report.editorial_dimension_failures.map((item) => `editorial:${String(item || '').trim()}`) : []),
    ...(Array.isArray(report?.hook_agenda_failures) ? report.hook_agenda_failures.map((item) => `hook:${String(item || '').trim()}`) : []),
  ]);
}

function intersections(left, right) {
  const set = new Set(left);
  return right.filter((item) => set.has(item));
}

function rootCauseFor(rounds, budget) {
  const failed = rounds.filter((item) => item.should_revise);
  const final = rounds.at(-1) || null;
  const repeated = [];
  for (let index = 1; index < failed.length; index++) repeated.push(...intersections(failed[index - 1].debt_keys, failed[index].debt_keys));
  const repeatedKeys = unique(repeated);
  const deliveryDebt = repeatedKeys.filter((key) => DELIVERY_KEYS.has(key));
  const exhausted = Boolean(final?.should_revise) && rounds.length >= budget + 1;
  const drift = failed.length >= 2 && repeatedKeys.length === 0;
  let primary = 'unknown';
  if (exhausted) primary = 'budget_exhausted';
  else if (deliveryDebt.length) primary = 'contract_delivery';
  else if (repeatedKeys.length) primary = 'repair_loop';
  else if (drift) primary = 'diagnostic_drift';
  return { primary, repeated_keys: repeatedKeys, repeated_delivery_keys: deliveryDebt, exhausted, drift, resolved: Boolean(final) && !final.should_revise };
}

function chapterEntry(chapter, items, budget) {
  const rounds = items.sort((left, right) => left.round - right.round).map((item) => ({
    round: item.round,
    file: item.file,
    manuscript_sha256: String(item.report.manuscript_sha256 || ''),
    verdict: String(item.report.verdict || ''),
    should_revise: item.report.should_revise === true,
    debt_keys: debtKeys(item.report),
    mean_score: average(Object.values(item.report.scores || {}).map(Number).filter(Number.isFinite)),
  }));
  const failedRounds = rounds.filter((item) => item.should_revise);
  if (!failedRounds.length) return null;
  const attribution = rootCauseFor(rounds, budget);
  return {
    chapter,
    review_rounds: rounds,
    failed_rounds: failedRounds.map((item) => item.round),
    initial_debt_keys: failedRounds[0].debt_keys,
    final_round: rounds.at(-1)?.round || null,
    final_status: attribution.resolved ? 'repaired' : 'unresolved',
    root_cause: attribution.primary,
    repeated_debt_keys: attribution.repeated_keys,
    repeated_delivery_keys: attribution.repeated_delivery_keys,
    repair_budget_exhausted: attribution.exhausted,
    diagnostic_drift: attribution.drift,
  };
}

function counts(values, limit) {
  const tally = new Map();
  for (const value of values) tally.set(value, Number(tally.get(value) || 0) + 1);
  return [...tally.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, limit).map(([key, count]) => ({ key, count }));
}

function recommendationFor(root, topDebt) {
  const detail = topDebt?.key ? ` Prioritize ${topDebt.key} with literal on-page proof.` : '';
  return {
    repair_loop: `The same debt survives revision. Keep the repair scoped to the original failure instead of applying a generic language rewrite.${detail}`,
    contract_delivery: `The assigned scene contract is repeatedly not landing. Before drafting, make goal, obstacle, turn, payoff, and hook visible in scene order; do not replace them with summary.${detail}`,
    diagnostic_drift: `Repair changes the failing category instead of resolving it. Preserve the initial repair target and compare all debt keys before accepting the revision.${detail}`,
    budget_exhausted: `The bounded repair budget was exhausted. Rebuild the next attempt from the chapter card and exact failed debt, not from the last failed prose.${detail}`,
    unknown: 'No repeated repair debt is available. Follow the binding chapter card and cold-reader report.',
  }[root] || 'Follow the binding chapter card and cold-reader report.';
}

function audit(entries) {
  const rootCounts = Object.fromEntries(ROOT_CAUSES.map((root) => [root, 0]));
  for (const entry of entries) rootCounts[entry.root_cause] = Number(rootCounts[entry.root_cause] || 0) + 1;
  const total = entries.length || 1;
  const primary = [...ROOT_CAUSES].sort((left, right) => rootCounts[right] - rootCounts[left] || left.localeCompare(right))[0];
  const topDebtKeys = counts(entries.flatMap((entry) => entry.initial_debt_keys), 6);
  const topRepeatedDebtKeys = counts(entries.flatMap((entry) => entry.repeated_debt_keys), 6);
  const unresolved = entries.filter((entry) => entry.final_status === 'unresolved').map((entry) => entry.chapter);
  return {
    root_cause_counts: rootCounts,
    root_cause_ratios: Object.fromEntries(ROOT_CAUSES.map((root) => [root, Number((rootCounts[root] / total).toFixed(3))])),
    primary_root_cause: entries.length ? primary : 'unknown',
    top_initial_debt_keys: topDebtKeys,
    top_repeated_debt_keys: topRepeatedDebtKeys,
    unresolved_chapters: unresolved,
    recommendation: recommendationFor(entries.length ? primary : 'unknown', topRepeatedDebtKeys[0] || topDebtKeys[0]),
  };
}

function build(projectInput, options = {}) {
  const project = projectOf(projectInput);
  const found = reviewFiles(project, options);
  const budget = revisionBudget(project);
  const entries = [...found.groups.entries()].map(([chapter, items]) => chapterEntry(chapter, items, budget)).filter(Boolean).sort((left, right) => left.chapter - right.chapter);
  const report = audit(entries);
  const ledger = { schema_version: '1.0', generated_at: new Date().toISOString(), chapter_range: { start: found.start, end: found.end === Infinity ? null : found.end }, revision_budget: budget, entries, warnings: found.warnings, audit: report };
  const state = readJson(path.join(project, 'state', 'project-state.json'), {});
  const targetChapter = Number.parseInt(options.chapter || String(Number(state.updated_through || 0) + 1), 10) || null;
  const guidance = {
    schema_version: '1.0', generated_at: ledger.generated_at, target_chapter: targetChapter, source: LEDGER_FILE,
    primary_root_cause: report.primary_root_cause, top_repeated_debt_keys: report.top_repeated_debt_keys, unresolved_chapters: report.unresolved_chapters,
    recommendation: report.recommendation,
    rule: 'Use this as a repair-process diagnosis. It cannot override the chapter card, accepted canon, reader contract, platform contract, or literal-evidence gates.',
  };
  return { project, ledger, guidance };
}

function write(projectInput, options = {}) {
  const result = build(projectInput, options);
  atomicWrite(path.join(result.project, LEDGER_FILE), `${JSON.stringify(result.ledger, null, 2)}\n`);
  atomicWrite(path.join(result.project, GUIDANCE_FILE), `${JSON.stringify(result.guidance, null, 2)}\n`);
  return { ...result, output: LEDGER_FILE, guidance_output: GUIDANCE_FILE };
}

function inspect(projectInput) {
  const project = projectOf(projectInput);
  const ledger = readJson(path.join(project, LEDGER_FILE), { entries: [], audit: audit([]) });
  return { ok: true, project, file: LEDGER_FILE, guidance_file: GUIDANCE_FILE, entries: Array.isArray(ledger.entries) ? ledger.entries.length : 0, audit: ledger.audit || audit([]) };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.command || !args.project || !['update', 'audit'].includes(args.command)) throw new CliError('USAGE', 'Usage: node repair-debt-ledger.js update|audit <PROJECT> [--chapter N] [--start N] [--end N]');
  const result = args.command === 'update' ? write(args.project, args) : inspect(args.project);
  const output = args.command === 'update' ? { ok: true, project: result.project, output: result.output, guidance_output: result.guidance_output, entries: result.ledger.entries.length, audit: result.ledger.audit } : result;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'repair-debt-ledger'); }
}

module.exports = { LEDGER_FILE, GUIDANCE_FILE, ROOT_CAUSES, DELIVERY_KEYS, argsOf, normal, chapterId, average, unique, projectOf, readJson, revisionBudget, reviewFiles, debtKeys, intersections, rootCauseFor, chapterEntry, counts, recommendationFor, audit, build, write, inspect, run };
