#!/usr/bin/env node
'use strict';

/*
 * Ranking acquisition with redundant evidence paths.  A failed dynamic scrape
 * must not make the research pipeline silently invent a trend: it either uses
 * a verified local export/cache and labels it, or returns a compact error log.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { CliError, emitError, parseRankInput, objectsDeep, normalizeBook, atomicWrite } = require('./cap-utils');

function argsOf(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (['dry-run'].includes(key)) { args[key] = true; continue; }
    const value = argv[++i];
    if (['input', 'url'].includes(key)) args[key] = args[key] === undefined ? value : [].concat(args[key], value);
    else args[key] = value;
  }
  return args;
}

function valuesOf(value) {
  return [].concat(value || []).flatMap((item) => String(item || '').split(',')).map((item) => item.trim()).filter(Boolean);
}

function platformConfig(name) {
  const file = path.join(__dirname, '..', 'assets', 'platforms', `${name}.json`);
  if (!fs.existsSync(file)) throw new CliError('UNKNOWN_PLATFORM', `Unknown platform: ${name}`, { supported: fs.readdirSync(path.dirname(file)).map((x) => path.basename(x, '.json')) });
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function endpointOf(base) {
  const clean = base.replace(/\/+$/, '');
  return /\/v[12]$/i.test(clean) ? `${clean}/scrape` : `${clean}/v2/scrape`;
}

function firecrawlRequest(url, config) {
  return {
    url, onlyMainContent: true, timeout: 120000, actions: config.actions || [],
    formats: [{
      type: 'json',
      prompt: 'Extract the visible ranked novel list. Preserve rank, title, author, genre/category, word count, status, tags, and blurb when present. Do not invent missing fields.',
      schema: { type: 'object', properties: { books: { type: 'array', items: { type: 'object', required: ['rank', 'title'], properties: { rank: { type: 'integer' }, title: { type: 'string' }, author: { type: 'string' }, genre: { type: 'string' }, words: { anyOf: [{ type: 'number' }, { type: 'string' }] }, status: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, blurb: { type: 'string' } } } } }, required: ['books'] },
    }, 'markdown'],
  };
}

function validateRows(rows) {
  const diagnostics = [];
  const seenRanks = new Set(); const seenTitles = new Set();
  for (const row of rows) {
    if (seenRanks.has(row.rank)) diagnostics.push({ severity: 'warning', code: 'DUPLICATE_RANK', value: row.rank });
    if (seenTitles.has(row.title)) diagnostics.push({ severity: 'warning', code: 'DUPLICATE_TITLE', value: row.title });
    seenRanks.add(row.rank); seenTitles.add(row.title);
  }
  return diagnostics;
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${String(row.title || '').trim().toLowerCase()}\0${String(row.author || '').trim().toLowerCase()}`;
    if (!key.trim() || seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => Number(a.rank || Infinity) - Number(b.rank || Infinity));
}

function readCache(file, maxHours) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(snapshot.items) || !snapshot.items.length) return null;
    const captured = Date.parse(snapshot.captured_at || '');
    const ageHours = Number.isFinite(captured) ? (Date.now() - captured) / 3600000 : Infinity;
    if (ageHours > maxHours) return null;
    return { snapshot, age_hours: Number(ageHours.toFixed(2)) };
  } catch (_) { return null; }
}

async function scrapeOnce(url, config, env, timeoutMs) {
  const base = env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev';
  const key = env.FIRECRAWL_API_KEY;
  if (!key && !env.FIRECRAWL_API_URL) throw new CliError('FIRECRAWL_KEY_MISSING', 'Cloud Firecrawl needs FIRECRAWL_API_KEY', { environment: 'FIRECRAWL_API_KEY' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpointOf(base), { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(firecrawlRequest(url, config)), signal: controller.signal });
    const text = await response.text();
    let raw; try { raw = JSON.parse(text); } catch (_) { raw = { text }; }
    if (!response.ok || raw.success === false) throw new CliError('FIRECRAWL_REQUEST_FAILED', `Firecrawl returned ${response.status}`, { status: response.status, response: raw });
    const rows = objectsDeep(raw.data?.json || raw.json || raw.data || raw).map((item, index) => normalizeBook(item, `${config.displayName} / Firecrawl`, index + 1, new Date().toISOString())).filter(Boolean);
    if (!rows.length) throw new CliError('FIRECRAWL_EXTRACTION_EMPTY', 'Firecrawl response contains no normalized ranking rows', { url });
    return { url, rows, raw, endpoint: endpointOf(base) };
  } finally { clearTimeout(timer); }
}

async function scrapeWithRetry(url, config, env, retry, timeoutMs) {
  const attempts = [];
  for (let number = 1; number <= retry + 1; number++) {
    try { const result = await scrapeOnce(url, config, env, timeoutMs); return { ...result, attempts }; }
    catch (error) { attempts.push({ url, attempt: number, code: error.code || 'REQUEST_ERROR', message: error.message }); }
  }
  return { url, rows: [], raw: null, attempts };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = argsOf(argv);
  if (args.adapter === 'crawl4ai') return crawl4aiLocal(args);
  if (!args.platform) throw new CliError('USAGE', 'Usage: node rank-scan.js --platform <platform> [--input FILE ... | --url URL ...] [--cache FILE] [--retry N] [--out FILE]');
  const config = platformConfig(args.platform);
  const inputs = valuesOf(args.input);
  const urls = valuesOf(args.url).length ? valuesOf(args.url) : (config.url ? [config.url] : []);
  if (!inputs.length && (!urls.length || config.requiresUrl)) throw new CliError('URL_REQUIRED', `${args.platform} needs a verified ranking URL or offline export`, { platform: args.platform });
  const retry = Math.max(0, Math.min(5, Number.parseInt(args.retry || '2', 10) || 0));
  const timeoutMs = Math.max(1000, Math.min(180000, Number.parseInt(args['timeout-ms'] || '30000', 10) || 30000));
  const maxCacheHours = Math.max(1, Math.min(24 * 30, Number(args['max-cache-hours'] || 72)));
  const minimumSample = Math.max(1, Number.parseInt(args['min-sample'] || '1', 10) || 1);
  const capturedAt = new Date().toISOString();
  const acquisition = { mode: inputs.length ? 'offline_exports' : 'online', urls, inputs, retry, timeout_ms: timeoutMs, attempts: [], fallback: null };
  let rows = []; let rawEvidence = [];

  if (inputs.length) {
    for (const input of inputs) rows.push(...parseRankInput(path.resolve(input), `${config.displayName} import`));
  } else {
    const base = env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev';
    if (args['dry-run']) {
      const dry = { ok: true, dryRun: true, platform: args.platform, endpoint: endpointOf(base), requests: urls.map((url) => firecrawlRequest(url, config)), retry, cache: args.cache || null };
      process.stdout.write(`${JSON.stringify(dry, null, 2)}\n`); return dry;
    }
    for (const url of urls) {
      const result = await scrapeWithRetry(url, config, env, retry, timeoutMs);
      rows.push(...result.rows); acquisition.attempts.push(...result.attempts);
      if (result.raw) rawEvidence.push({ url, endpoint: result.endpoint, response: result.raw });
    }
    if (!rows.length) {
      const cached = readCache(args.cache ? path.resolve(args.cache) : '', maxCacheHours);
      if (cached) { rows = cached.snapshot.items; acquisition.mode = 'cache_fallback'; acquisition.fallback = { path: path.resolve(args.cache), age_hours: cached.age_hours, reason: 'all online paths failed' }; }
    }
  }

  rows = dedupeRows(rows);
  if (!rows.length) throw new CliError('RANKING_ACQUISITION_FAILED', 'All ranking acquisition paths failed; no trend may be inferred', { platform: args.platform, attempts: acquisition.attempts, cache: args.cache || null });
  const diagnostics = validateRows(rows);
  if (rows.length < minimumSample) diagnostics.push({ severity: 'warning', code: 'LOW_SAMPLE_SIZE', sample_size: rows.length, minimum_sample: minimumSample });
  const snapshot = { schema_version: '1.1', ok: true, platform: args.platform, platform_name: config.displayName, source_url: inputs.length ? null : urls[0] || null, source_file: inputs.length === 1 ? path.resolve(inputs[0]) : null, captured_at: capturedAt, sample_size: rows.length, items: rows, diagnostics, acquisition };
  if (args.out) atomicWrite(args.out, `${JSON.stringify(snapshot, null, 2)}\n`);
  if (args.cache) atomicWrite(path.resolve(args.cache), `${JSON.stringify(snapshot, null, 2)}\n`);
  if (args.evidence && rawEvidence.length) atomicWrite(args.evidence, `${JSON.stringify({ captured_at: capturedAt, acquisition, sources: rawEvidence }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

function crawl4aiLocal(args) {
  const project = path.resolve(String(args.project || ''));
  if (!args.project || !fs.existsSync(path.join(project, 'settings', 'market-sources.json'))) throw new CliError('CRAWL4AI_PROJECT_REQUIRED', 'Crawl4AI adapter requires --project with settings/market-sources.json', { project });
  const settings = JSON.parse(fs.readFileSync(path.join(project, 'settings', 'market-sources.json'), 'utf8').replace(/^\uFEFF/, ''));
  const pages = [...(Array.isArray(settings.pages) ? settings.pages : []), ...(Array.isArray(settings.urls) ? settings.urls : [])].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
  if (!pages.length) throw new CliError('CRAWL4AI_PAGES_REQUIRED', 'market-sources.json needs pages for Crawl4AI acquisition', { file: 'settings/market-sources.json' });
  const script = path.join(__dirname, 'crawl4ai-rank-scan.py');
  const out = path.resolve(project, args.out || 'analysis/ranking-snapshot.json');
  const evidence = path.resolve(project, args.evidence || 'evidence/snapshots');
  const command = String(args.python || settings.python || 'python');
  const childArgs = [script, '--out', out, '--evidence-dir', evidence, '--min-sample', String(settings.min_sample || 10), '--pages', ...pages];
  if (settings.cdp) childArgs.push('--cdp', String(settings.cdp));
  if (settings.persistent_dir) childArgs.push('--persistent-dir', String(settings.persistent_dir));
  const result = spawnSync(command, childArgs, { cwd: project, encoding: 'utf8', shell: false, timeout: 900000, maxBuffer: 20 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0 || !fs.existsSync(out)) throw new CliError('CRAWL4AI_ACQUISITION_FAILED', 'Local Crawl4AI acquisition failed', { command, args: childArgs, status: result.status, stderr: String(result.stderr || result.error?.message || '').slice(-4000), stdout: String(result.stdout || '').slice(-2000) });
  const snapshot = JSON.parse(fs.readFileSync(out, 'utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(snapshot.items) || snapshot.items.length < Number(settings.min_sample || 10)) throw new CliError('CRAWL4AI_SNAPSHOT_INVALID', 'Crawl4AI did not produce a sufficient normalized snapshot', { out, items: snapshot.items?.length || 0 });
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`); return snapshot;
}

if (require.main === module) main().catch((error) => { process.exitCode = emitError(error, 'rank-scan'); });
module.exports = { argsOf, valuesOf, endpointOf, firecrawlRequest, validateRows, dedupeRows, readCache, scrapeOnce, scrapeWithRetry, crawl4aiLocal, main };
