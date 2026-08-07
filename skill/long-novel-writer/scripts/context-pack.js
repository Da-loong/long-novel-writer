#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

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
  const half = Math.floor((limit - 80) / 2);
  return `${text.slice(0, half)}\n\n[...中段已按字符预算截断...]\n\n${text.slice(-half)}`;
}

function build(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  if (!fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', `项目不存在: ${project}`, { path: project });
  const statePath = path.join(project, 'state', 'project-state.json');
  if (!fs.existsSync(statePath)) throw new CliError('STATE_MISSING', '缺少 state/project-state.json', { project });
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const targetChapter = Number.parseInt(options.chapter || String(Number(state.updated_through || 0) + 1), 10);
  if (!Number.isFinite(targetChapter) || targetChapter <= 0) throw new CliError('INVALID_CHAPTER', '目标章号必须为正整数', { chapter: options.chapter });
  const budget = Number.parseInt(options.budget || '40000', 10);
  const recentCount = Number.parseInt(options.recent || '3', 10);
  const retrieveCount = Number.parseInt(options.retrieve || '3', 10);
  const terms = termsOf(options.query || '');
  const fixed = [
    'settings/reader-contract.md', 'settings/platform-contract.md', 'settings/style-guide.md', 'settings/story-bible.md', 'settings/characters.md', 'settings/relations.md',
    'outline/master-outline.md', 'outline/chapter-beats.md', 'outline/foreshadowing-ledger.md',
    'evidence/sources/source-index.md', 'evidence/derivations/decision-log.md', 'supervision/dashboard.md', 'supervision/review-queue.md', 'supervision/stop-conditions.md',
    'state/current-state.md', 'state/character-state.md', 'state/timeline.md', 'state/unresolved-hooks.md',
  ];
  const selected = fixed.filter((name) => fs.existsSync(path.join(project, name))).map((name) => ({ tier: name.startsWith('state/') ? 'hot-state' : 'warm-core', name, score: null }));
  const manuscript = path.join(project, 'manuscript');
  const chapters = fs.existsSync(manuscript) ? fs.readdirSync(manuscript).filter((name) => /^ch-\d{4}-.+\.md$/i.test(name) && chapterNumber(name) < targetChapter).sort((a, b) => chapterNumber(a) - chapterNumber(b)) : [];
  const recent = chapters.slice(-recentCount);
  for (const name of recent) selected.push({ tier: 'hot-recent', name: `manuscript/${name}`, score: null });
  const older = chapters.filter((name) => !recent.includes(name)).map((name) => {
    const relative = `manuscript/${name}`;
    const text = fs.readFileSync(path.join(project, relative), 'utf8');
    return { tier: 'cold-retrieved', name: relative, score: relevance(text, terms) };
  }).filter((item) => terms.length && item.score > 0).sort((a, b) => b.score - a.score || chapterNumber(b.name) - chapterNumber(a.name)).slice(0, retrieveCount);
  selected.push(...older);

  const manifest = {
    schema_version: '1.0', target_chapter: targetChapter, state_updated_through: Number(state.updated_through || 0), generated_at: new Date().toISOString(),
    query: options.query || '', terms, budget, sources: [],
  };
  let remaining = budget;
  const sections = [];
  for (const item of selected) {
    if (remaining < 200) break;
    const full = fs.readFileSync(path.join(project, item.name), 'utf8').replace(/^\uFEFF/, '');
    const cap = Math.min(item.tier === 'hot-recent' ? 9000 : 5000, remaining);
    const text = excerpt(full, cap);
    remaining -= text.length;
    manifest.sources.push({ path: item.name.replace(/\\/g, '/'), tier: item.tier, score: item.score, original_chars: full.length, included_chars: text.length, truncated: text.length < full.length });
    sections.push(`## ${item.tier}: ${item.name.replace(/\\/g, '/')}\n\n${text.trim()}\n`);
  }
  const markdown = `# 第 ${targetChapter} 章上下文包\n\n<!-- context-manifest: ${JSON.stringify(manifest)} -->\n\n> 本文件是可重建缓存；事实仍以所列源文件为准。\n\n${sections.join('\n')}`;
  return { project, targetChapter, manifest, markdown };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project) throw new CliError('USAGE', '用法: node context-pack.js <项目目录> [--chapter N] [--query 关键词] [--recent 3] [--retrieve 3] [--budget 40000] [--out 文件]');
  const result = build(args.project, args);
  const output = path.resolve(args.out || path.join(result.project, 'state', 'context-pack.md'));
  atomicWrite(output, result.markdown);
  const report = { ok: true, project: result.project, output, target_chapter: result.targetChapter, source_count: result.manifest.sources.length, included_chars: result.manifest.sources.reduce((sum, item) => sum + item.included_chars, 0), tiers: result.manifest.sources.reduce((acc, item) => ({ ...acc, [item.tier]: (acc[item.tier] || 0) + 1 }), {}) };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'context-pack'); }
}

module.exports = { argsOf, chapterNumber, termsOf, relevance, excerpt, build, run };
