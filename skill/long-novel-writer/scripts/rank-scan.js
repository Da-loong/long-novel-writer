#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError, parseRankInput, objectsDeep, normalizeBook, atomicWrite } = require('./cap-utils');

function argsOf(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (['dry-run'].includes(key)) args[key] = true;
    else args[key] = argv[++i];
  }
  return args;
}

function platformConfig(name) {
  const file = path.join(__dirname, '..', 'assets', 'platforms', `${name}.json`);
  if (!fs.existsSync(file)) throw new CliError('UNKNOWN_PLATFORM', `未知平台: ${name}`, { supported: fs.readdirSync(path.dirname(file)).map((x) => path.basename(x, '.json')) });
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function endpointOf(base) {
  const clean = base.replace(/\/+$/, '');
  if (/\/v[12]$/i.test(clean)) return `${clean}/scrape`;
  return `${clean}/v2/scrape`;
}

function firecrawlRequest(url, config) {
  return {
    url,
    onlyMainContent: true,
    timeout: 120000,
    actions: config.actions || [],
    formats: [
      {
        type: 'json',
        prompt: 'Extract the visible ranked novel list. Preserve rank, title, author, genre/category, word count, status, tags, and blurb when present. Do not invent missing fields.',
        schema: {
          type: 'object',
          properties: {
            books: {
              type: 'array',
              items: {
                type: 'object',
                required: ['rank', 'title'],
                properties: {
                  rank: { type: 'integer' }, title: { type: 'string' }, author: { type: 'string' }, genre: { type: 'string' },
                  words: { anyOf: [{ type: 'number' }, { type: 'string' }] }, status: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, blurb: { type: 'string' },
                },
              },
            },
          },
          required: ['books'],
        },
      },
      'markdown',
    ],
  };
}

function validateRows(rows) {
  const diagnostics = [];
  const seenRanks = new Set();
  const seenTitles = new Set();
  for (const row of rows) {
    if (seenRanks.has(row.rank)) diagnostics.push({ severity: 'warning', code: 'DUPLICATE_RANK', value: row.rank });
    if (seenTitles.has(row.title)) diagnostics.push({ severity: 'warning', code: 'DUPLICATE_TITLE', value: row.title });
    seenRanks.add(row.rank); seenTitles.add(row.title);
  }
  return diagnostics;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = argsOf(argv);
  if (!args.platform) throw new CliError('USAGE', '用法: node rank-scan.js --platform <平台> [--input 文件 | --url URL] [--out 文件] [--dry-run]');
  const config = platformConfig(args.platform);
  const url = args.url || config.url;
  if (!args.input && (!url || config.requiresUrl)) throw new CliError('URL_REQUIRED', `${args.platform} 需要显式提供经过核验的榜单 URL`, { platform: args.platform });
  const capturedAt = new Date().toISOString();
  const source = args.input ? path.resolve(args.input) : url;
  let rows;
  let rawEvidence = null;

  if (args.input) {
    rows = parseRankInput(args.input, `${config.displayName}导入`);
  } else {
    const base = env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev';
    const request = firecrawlRequest(url, config);
    if (args['dry-run']) {
      const dry = { ok: true, dryRun: true, platform: args.platform, endpoint: endpointOf(base), request };
      process.stdout.write(`${JSON.stringify(dry, null, 2)}\n`);
      return dry;
    }
    const key = env.FIRECRAWL_API_KEY;
    if (!key && !env.FIRECRAWL_API_URL) throw new CliError('FIRECRAWL_KEY_MISSING', '云端 Firecrawl 请求缺少 FIRECRAWL_API_KEY', { environment: 'FIRECRAWL_API_KEY' });
    const response = await fetch(endpointOf(base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(request),
    });
    const text = await response.text();
    try { rawEvidence = JSON.parse(text); } catch (_) { rawEvidence = { text }; }
    if (!response.ok || rawEvidence.success === false) throw new CliError('FIRECRAWL_REQUEST_FAILED', `Firecrawl 返回 ${response.status}`, { status: response.status, response: rawEvidence });
    const candidates = objectsDeep(rawEvidence.data?.json || rawEvidence.json || rawEvidence.data || rawEvidence);
    rows = candidates.map((item, index) => normalizeBook(item, `${config.displayName} / Firecrawl`, index + 1, capturedAt)).filter(Boolean);
  }

  if (!rows.length) throw new CliError('EMPTY_RANKING', '榜单结果为空；停止趋势推断', { platform: args.platform, source });
  const snapshot = {
    schema_version: '1.0', ok: true, platform: args.platform, platform_name: config.displayName, source_url: args.input ? null : url,
    source_file: args.input ? path.resolve(args.input) : null, captured_at: capturedAt, sample_size: rows.length, items: rows, diagnostics: validateRows(rows),
  };
  if (args.out) atomicWrite(args.out, `${JSON.stringify(snapshot, null, 2)}\n`);
  if (args.evidence && rawEvidence) atomicWrite(args.evidence, `${JSON.stringify({ captured_at: capturedAt, endpoint: endpointOf(env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev'), response: rawEvidence }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

if (require.main === module) main().catch((error) => { process.exitCode = emitError(error, 'rank-scan'); });

module.exports = { argsOf, endpointOf, firecrawlRequest, validateRows, main };
