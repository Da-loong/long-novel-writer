#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const DEFAULT_POLICY = { context_budget_chars: 40000, recent_chapters: 3, cold_memories: 3 };
const TIER_CAPS = { critical: 2400, 'hot-recent': 6500, 'hot-state': 2600, 'warm-core': 1800, 'cold-retrieved': 2800 };

function argsOf(argv) {
  const args = { recent: '3', retrieve: '3', budget: '40000' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
    else if (!args.project) args.project = argv[i];
  }
  return args;
}

function chapterNumber(name) {
  return Number.parseInt(path.basename(name).match(/^ch-(\d{4})-/i)?.[1] || '0', 10);
}

function termsOf(query) {
  const source = String(query || '').normalize('NFKC');
  const words = source.match(/[A-Za-z0-9_-]{2,}|[\u3400-\u9fff]{2,8}/g) || [];
  const bigrams = [];
  for (const word of words.filter((item) => /^[\u3400-\u9fff]+$/.test(item))) for (let i = 0; i < word.length - 1; i++) bigrams.push(word.slice(i, i + 2));
  return [...new Set([...words, ...bigrams].map((item) => item.toLowerCase()))];
}

function relevance(text, terms) {
  const haystack = text.toLowerCase();
  return terms.reduce((score, term) => {
    let count = 0; let index = 0;
    while ((index = haystack.indexOf(term, index)) >= 0) { count++; index += term.length; }
    return score + Math.min(count, 8) * Math.max(1, term.length - 1);
  }, 0);
}

function excerpt(text, limit) {
  if (text.length <= limit) return text;
  const half = Math.max(1, Math.floor((limit - 44) / 2));
  return `${text.slice(0, half)}\n\n[...context truncated by character budget...]\n\n${text.slice(-half)}`;
}

function numberOr(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function readPolicy(project) {
  const file = path.join(project, 'settings', 'context-policy.json');
  if (!fs.existsSync(file)) return { ...DEFAULT_POLICY };
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return {
      context_budget_chars: numberOr(value.context_budget_chars, DEFAULT_POLICY.context_budget_chars),
      recent_chapters: numberOr(value.recent_chapters, DEFAULT_POLICY.recent_chapters),
      cold_memories: numberOr(value.cold_memories, DEFAULT_POLICY.cold_memories),
    };
  } catch (error) {
    throw new CliError('CONTEXT_POLICY_INVALID', 'Context policy must be valid JSON', { file, message: error.message });
  }
}

function normal(relative) {
  return relative.replace(/\\/g, '/');
}

function readText(project, relative) {
  return fs.readFileSync(path.join(project, relative), 'utf8').replace(/^\uFEFF/, '');
}

function targetBeat(project, chapter) {
  const relative = 'outline/chapter-beats.md';
  const file = path.join(project, relative);
  if (!fs.existsSync(file)) return null;
  const full = readText(project, relative);
  const row = full.split(/\r?\n/).find((line) => {
    if (!line.trim().startsWith('|') || /^\|?\s*:?-{3,}/.test(line.trim())) return false;
    const first = line.trim().replace(/^\||\|$/g, '').split('|')[0].trim();
    return Number.parseInt(first, 10) === chapter;
  });
  if (!row) return null;
  return { name: relative, text: `# Target chapter beat\n\n${row.trim()}\n`, originalChars: full.length, representation: 'target-beat' };
}

function memoryRepresentation(project, manuscriptRelative) {
  const number = chapterNumber(manuscriptRelative);
  const memoryRelative = `state/chapter-memory/ch-${String(number).padStart(4, '0')}.json`;
  const file = path.join(project, memoryRelative);
  if (!fs.existsSync(file)) return null;
  try {
    const memory = JSON.parse(readText(project, memoryRelative));
    const capsule = memory.capsule || {};
    if (![capsule.opening, capsule.turning, capsule.ending].every((item) => String(item || '').trim())) return null;
    const states = (memory.state_after || []).map((item) => item.path).filter(Boolean).join(', ');
    return {
      text: `# Chapter ${number} memory capsule\n\nOpening: ${capsule.opening}\n\nTurning: ${capsule.turning}\n\nEnding: ${capsule.ending}\n\nState snapshot paths: ${states || 'none'}\n`,
      memoryPath: memoryRelative,
    };
  } catch (_) { return null; }
}

function recentFactLedgers(project, chapter, limit) {
  const directory = path.join(project, 'state', 'fact-ledger');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => /^ch-\d{4}\.json$/i.test(name) && Number.parseInt(name.slice(3, 7), 10) < chapter)
    .sort((left, right) => Number.parseInt(right.slice(3, 7), 10) - Number.parseInt(left.slice(3, 7), 10))
    .slice(0, limit)
    .map((name) => candidate('hot-state', `state/fact-ledger/${name}`, { representation: 'chapter-facts' }));
}

function candidate(tier, name, extras = {}) {
  return { tier, name, score: null, ...extras };
}

function build(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  if (!fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', `Project does not exist: ${project}`, { path: project });
  const statePath = path.join(project, 'state', 'project-state.json');
  if (!fs.existsSync(statePath)) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
  const policy = readPolicy(project);
  const targetChapter = Number.parseInt(options.chapter || String(Number(state.updated_through || 0) + 1), 10);
  if (!Number.isFinite(targetChapter) || targetChapter <= 0) throw new CliError('INVALID_CHAPTER', 'Target chapter must be a positive integer', { chapter: options.chapter });
  const budget = numberOr(options.budget, policy.context_budget_chars);
  const recentCount = numberOr(options.recent, policy.recent_chapters);
  const retrieveCount = numberOr(options.retrieve, policy.cold_memories);
  const terms = termsOf(options.query || '');

  const byPresence = (tier, names) => names.filter((name) => fs.existsSync(path.join(project, name))).map((name) => candidate(tier, name));
  const chapterBeat = targetBeat(project, targetChapter);
  const chapterCard = `state/chapter-cards/ch-${String(targetChapter).padStart(4, '0')}.json`;
  const critical = [
    ...byPresence('critical', ['settings/reader-contract.md', 'settings/platform-contract.md', 'settings/author-intent.md']),
    ...(chapterBeat ? [candidate('critical', chapterBeat.name, chapterBeat)] : []),
    ...byPresence('critical', ['state/current-state.md', 'state/current-focus.md', 'state/unresolved-hooks.md', 'state/feedback-rules.json', 'state/style-contract.json', 'state/character-contracts.json', 'state/foreshadowing-index.json', 'state/foreshadowing-progress.json', 'state/hook-agenda.json', 'state/pacing-ledger.json', chapterCard]),
  ];
  const hotState = [...byPresence('hot-state', ['state/character-state.md', 'state/timeline.md', 'state/workflow-run.json']), ...recentFactLedgers(project, targetChapter, recentCount)];
  const warm = byPresence('warm-core', [
    'settings/platform-classroom-map.md', 'settings/workflow-policy.json', 'settings/style-guide.md', 'settings/story-bible.md', 'settings/characters.md', 'settings/relations.md',
    'outline/master-outline.md', 'outline/foreshadowing-ledger.md', 'evidence/sources/source-index.md', 'evidence/sources/writer-classroom-index.md', 'evidence/derivations/decision-log.md',
    'supervision/dashboard.md', 'supervision/review-queue.md', 'supervision/stop-conditions.md',
  ]);
  const manuscript = path.join(project, 'manuscript');
  const chapters = fs.existsSync(manuscript)
    ? fs.readdirSync(manuscript).filter((name) => /^ch-\d{4}-.+\.md$/i.test(name) && chapterNumber(name) < targetChapter).sort((a, b) => chapterNumber(a) - chapterNumber(b))
    : [];
  const recent = chapters.slice(-recentCount).map((name) => candidate('hot-recent', `manuscript/${name}`));
  const older = chapters.filter((name) => !recent.some((item) => item.name === `manuscript/${name}`)).map((name) => {
    const relative = `manuscript/${name}`;
    const full = readText(project, relative);
    const memory = memoryRepresentation(project, relative);
    return candidate('cold-retrieved', relative, {
      score: relevance(full, terms),
      ...(memory ? { text: memory.text, memoryPath: memory.memoryPath, representation: 'chapter-memory', originalChars: full.length } : {}),
    });
  }).filter((item) => terms.length && item.score > 0).sort((a, b) => b.score - a.score || chapterNumber(b.name) - chapterNumber(a.name)).slice(0, retrieveCount);
  const selected = [...critical, ...recent, ...hotState, ...warm, ...older];
  const manifest = {
    schema_version: '1.1', target_chapter: targetChapter, state_updated_through: Number(state.updated_through || 0), generated_at: new Date().toISOString(),
    query: options.query || '', terms, budget, context_policy: policy, sources: [],
    budget_report: { requested_chars: budget, included_chars: 0, remaining_chars: budget, tier_chars: {}, omitted: [] },
  };
  let remaining = budget;
  const sections = [];
  for (let index = 0; index < selected.length; index++) {
    const item = selected[index];
    if (remaining < 200) {
      for (const omitted of selected.slice(index)) manifest.budget_report.omitted.push({ path: normal(omitted.name), tier: omitted.tier, reason: 'budget' });
      break;
    }
    const full = item.text === undefined ? readText(project, item.name) : item.text;
    const originalChars = item.originalChars ?? full.length;
    const cap = Math.min(TIER_CAPS[item.tier] || 1800, remaining);
    // `excerpt` normally honors cap, and this final slice protects the global
    // budget when a tiny remaining allowance cannot fit the truncation marker.
    const text = excerpt(full, cap).slice(0, cap);
    remaining -= text.length;
    manifest.budget_report.included_chars += text.length;
    manifest.budget_report.remaining_chars = remaining;
    manifest.budget_report.tier_chars[item.tier] = (manifest.budget_report.tier_chars[item.tier] || 0) + text.length;
    manifest.sources.push({
      path: normal(item.name), tier: item.tier, score: item.score, original_chars: originalChars, included_chars: text.length,
      truncated: text.length < full.length, representation: item.representation || 'source', ...(item.memoryPath ? { memory_path: normal(item.memoryPath) } : {}),
    });
    sections.push(`## ${item.tier}: ${normal(item.name)}\n\n${text.trim()}\n`);
  }
  const markdown = `# Chapter ${targetChapter} context pack\n\n<!-- context-manifest: ${JSON.stringify(manifest)} -->\n\n> This file is a rebuildable cache. Facts remain in the listed source files.\n\n${sections.join('\n')}`;
  return { project, targetChapter, manifest, markdown };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project) throw new CliError('USAGE', 'Usage: node context-pack.js <project> [--chapter N] [--query terms] [--recent 3] [--retrieve 3] [--budget 40000] [--out file]');
  const result = build(args.project, args);
  const output = path.resolve(args.out || path.join(result.project, 'state', 'context-pack.md'));
  atomicWrite(output, result.markdown);
  const report = {
    ok: true, project: result.project, output, target_chapter: result.targetChapter, source_count: result.manifest.sources.length,
    included_chars: result.manifest.budget_report.included_chars, tiers: result.manifest.sources.reduce((acc, item) => ({ ...acc, [item.tier]: (acc[item.tier] || 0) + 1 }), {}),
    budget_report: result.manifest.budget_report,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'context-pack'); }
}

module.exports = { DEFAULT_POLICY, TIER_CAPS, argsOf, chapterNumber, termsOf, relevance, excerpt, readPolicy, targetBeat, memoryRepresentation, recentFactLedgers, build, run };
