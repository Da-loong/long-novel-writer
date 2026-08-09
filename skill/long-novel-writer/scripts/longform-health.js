#!/usr/bin/env node
'use strict';

/* Detect 1M-word serialization decay from accepted reader receipts and literal fact events. */
const fs = require('fs'); const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');
const OUTPUT = 'state/longform-health.json';
const FACT_DIR = 'state/fact-ledger';
const CHECKPOINT = 20;
function argsOf(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { const v = argv[i]; if (v.startsWith('--')) { const n = argv[i + 1]; out[v.slice(2)] = n && !n.startsWith('--') ? n : true; if (out[v.slice(2)] !== true) i++; } else if (!out.command) out.command = v; else if (!out.project) out.project = v; } return out; }
function projectOf(input) { const project = path.resolve(input || ''); if (!input || !fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project }); return project; }
function json(file, fallback) { if (!fs.existsSync(file)) return fallback; try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (_) { return fallback; } }
function factLedgers(project) { const dir = path.join(project, FACT_DIR); return !fs.existsSync(dir) ? [] : fs.readdirSync(dir).filter((name) => /^ch-\d{4}\.json$/i.test(name)).map((name) => json(path.join(dir, name), null)).filter(Boolean).sort((a, b) => Number(a.chapter) - Number(b.chapter)); }
function latestChapter(facts, kind, term = null) { const relevant = facts.flatMap((entry) => (entry.facts || []).map((fact) => ({ ...fact, chapter: Number(entry.chapter) }))).filter((fact) => fact.kind === kind && (!term || `${fact.subject} ${fact.claim}`.toLowerCase().includes(term))); return relevant.length ? Math.max(...relevant.map((fact) => fact.chapter)) : 0; }
function build(projectInput) {
  const project = projectOf(projectInput); const state = json(path.join(project, 'state', 'project-state.json'), {}); const chapter = Number(state.updated_through || 0); const targetWords = Number(state.target_words || 1000000); const facts = factLedgers(project); const quality = json(path.join(project, 'state', 'quality-trend-ledger.json'), { audit: {} }); const pacing = json(path.join(project, 'state', 'pacing-ledger.json'), { audit: {} }); const projections = json(path.join(project, 'state', 'fact-projections.json'), { unresolved_hooks: [] }); const warnings = []; const metrics = {};
  const lastHook = Math.max(latestChapter(facts, 'hook_open'), latestChapter(facts, 'hook_closed'));
  const lastRelationship = latestChapter(facts, 'relationship'); const lastResource = latestChapter(facts, 'resource');
  metrics.subplot_stall_chapters = chapter - lastHook; metrics.relationship_stall_chapters = chapter - lastRelationship; metrics.progression_stall_chapters = chapter - lastResource;
  if (chapter >= CHECKPOINT && metrics.subplot_stall_chapters >= 16) warnings.push({ code: 'SUBPLOT_STALL', chapters_without_hook_movement: metrics.subplot_stall_chapters, action: 'Advance, resolve, or intentionally close one established subplot before adding another.' });
  if (chapter >= CHECKPOINT && metrics.relationship_stall_chapters >= 20) warnings.push({ code: 'RELATIONSHIP_STALL', chapters_without_relationship_change: metrics.relationship_stall_chapters, action: 'Give a central relationship a visible choice, cost, boundary, alliance, or rupture.' });
  if (chapter >= CHECKPOINT && metrics.progression_stall_chapters >= 20) warnings.push({ code: 'PROGRESSION_DECAY', chapters_without_resource_or_capability_change: metrics.progression_stall_chapters, action: 'Deliver a bounded gain, loss, reveal, or changed problem-solving capacity with a cost.' });
  if ((quality.audit?.trend === 'declining') && (pacing.audit?.warnings || []).length) warnings.push({ code: 'VOLUME_FATIGUE', quality_trend: quality.audit.trend, pacing_warnings: pacing.audit.warnings.map((item) => item.code), action: 'Rebuild the next plot unit around a new pressure/payoff shape; do not inflate stakes only.' });
  const openHooks = Array.isArray(projections.unresolved_hooks) ? projections.unresolved_hooks.length : 0; const nearingEnd = targetWords > 0 && Number(state.word_count || 0) / targetWords >= 0.8; const closed = latestChapter(facts, 'hook_closed'); const opened = latestChapter(facts, 'hook_open'); const recovery = opened ? Number((closed / opened).toFixed(3)) : null; metrics.unresolved_hooks = openHooks; metrics.completion_recovery_proxy = recovery;
  if (nearingEnd && openHooks > 0 && (recovery === null || recovery < 0.75)) warnings.push({ code: 'ENDING_PAYOFF_COVERAGE_LOW', unresolved_hooks: openHooks, recovery_proxy: recovery, action: 'Create a payoff map: resolve, transform, or explicitly close every major promise before the final volume.' });
  return { schema_version: '1.0', generated_at: new Date().toISOString(), chapter, target_words: targetWords, word_count: Number(state.word_count || 0), metrics, warnings, next_gate: warnings.length ? 'repair_before_next_volume' : 'healthy', sources: ['state/fact-ledger/index.json', 'state/quality-trend-ledger.json', 'state/pacing-ledger.json', 'state/fact-projections.json'] };
}
function write(projectInput) { const project = projectOf(projectInput); const report = build(project); atomicWrite(path.join(project, OUTPUT), `${JSON.stringify(report, null, 2)}\n`); return { ok: true, project, output: OUTPUT, warnings: report.warnings, next_gate: report.next_gate }; }
function run(argv = process.argv.slice(2)) { const args = argsOf(argv); if (args.command !== 'update' || !args.project) throw new CliError('USAGE', 'Usage: node longform-health.js update <PROJECT>'); const report = write(args.project); process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); return report; }
if (require.main === module) { try { run(); } catch (error) { process.exitCode = emitError(error, 'longform-health'); } }
module.exports = { OUTPUT, FACT_DIR, CHECKPOINT, factLedgers, latestChapter, build, write, run };
