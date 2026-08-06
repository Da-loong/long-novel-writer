#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const TEXT_EXT = new Set(['.md', '.txt', '.json', '.jsonl', '.html', '.htm', '.csv', '.tsv']);

class CliError extends Error {
  constructor(code, message, details = {}, exitCode = 2) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
  }
}

function emitError(error, command) {
  const known = error instanceof CliError;
  const payload = {
    ok: false,
    error: {
      code: known ? error.code : 'UNEXPECTED_ERROR',
      message: error.message || String(error),
      command,
      details: known ? error.details : {},
    },
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  return known ? error.exitCode : 1;
}

function walkFiles(input) {
  const p = path.resolve(input);
  if (!fs.existsSync(p)) throw new CliError('PATH_NOT_FOUND', `路径不存在: ${p}`, { path: p });
  const stat = fs.statSync(p);
  if (stat.isFile()) return [p];
  const out = [];
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const child = path.join(p, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(child));
    else if (TEXT_EXT.has(path.extname(entry.name).toLowerCase())) out.push(child);
  }
  return out.sort();
}

function readDocuments(input) {
  return walkFiles(input).map((file) => ({ file, text: fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') }));
}

function countText(text) {
  const body = text.replace(/^---[\s\S]*?---\s*/m, '').replace(/^#{1,6}\s+.*$/gm, '');
  return {
    chinese_chars: (body.match(/[\u3400-\u9fff]/g) || []).length,
    non_whitespace_chars: (body.match(/\S/g) || []).length,
    paragraphs: body.split(/\r?\n\s*\r?\n/).filter((x) => x.trim()).length,
    dialogue_lines: body.split(/\r?\n/).filter((x) => /[“「『].+[”」』]/.test(x)).length,
  };
}

function decodeHtml(s) {
  const named = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return String(s)
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, entity) => {
      if (entity[0] === '#') {
        const n = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : all;
      }
      return named[entity.toLowerCase()] ?? all;
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(s) {
  return s
    .replace(/<script\b[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '\n')
    .replace(/<br\s*\/?>|<\/(?:p|li|tr|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)
    .map(decodeHtml)
    .join('\n');
}

function firstValue(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) return obj[key];
  }
  return '';
}

function toWords(value) {
  if (typeof value === 'number') return Math.round(value);
  const s = String(value || '').replace(/,/g, '').trim();
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  if (/万/.test(s)) return Math.round(n * 10000);
  if (/[kK]/.test(s)) return Math.round(n * 1000);
  return Math.round(n);
}

function normalizeBook(obj, source, fallbackRank, capturedAt = new Date().toISOString()) {
  const title = String(firstValue(obj, ['title', '书名', '作品', 'bookName', 'book_name', 'name', 'novelName'])).trim();
  if (!title) return null;
  const tagsRaw = firstValue(obj, ['tags', '标签', 'tagList', 'keywords']);
  const parsedRank = Number.parseInt(firstValue(obj, ['rank', '排名', '榜次', 'ranking', 'position', 'index']) || fallbackRank, 10);
  return {
    rank: Number.isFinite(parsedRank) ? parsedRank : fallbackRank,
    title,
    author: String(firstValue(obj, ['author', '作者', 'writer', 'authorName', 'author_name'])).trim(),
    genre: String(firstValue(obj, ['genre', '分类', '题材', 'category', 'categoryName', 'channel'])).trim(),
    subgenre: String(firstValue(obj, ['subgenre', '二级分类', 'subCategory', 'sub_category'])).trim(),
    words: toWords(firstValue(obj, ['words', '字数', '总字数', 'wordCount', 'word_count', 'totalWords'])),
    status: String(firstValue(obj, ['status', '状态', 'bookStatus', 'serialStatus'])).trim(),
    blurb: String(firstValue(obj, ['blurb', '简介', 'intro', 'description', 'summary'])).trim(),
    tags: Array.isArray(tagsRaw) ? tagsRaw.map(String) : String(tagsRaw || '').split(/[,，/|]/).map((x) => x.trim()).filter(Boolean),
    source,
    captured_at: capturedAt,
    raw: obj,
  };
}

function objectsDeep(value, out = []) {
  if (Array.isArray(value)) for (const x of value) objectsDeep(x, out);
  else if (value && typeof value === 'object') {
    if (firstValue(value, ['title', '书名', '作品', 'bookName', 'book_name', 'novelName'])) out.push(value);
    else for (const x of Object.values(value)) objectsDeep(x, out);
  }
  return out;
}

const HEADERS = {
  rank: ['rank', 'ranking', 'position', '排名', '榜次', '序号'],
  title: ['title', 'book', 'bookname', 'name', '书名', '作品', '小说名'],
  author: ['author', 'writer', '作者'],
  genre: ['genre', 'category', 'channel', '分类', '题材', '频道'],
  words: ['words', 'wordcount', '字数', '总字数'],
  status: ['status', '状态'],
  blurb: ['blurb', 'intro', 'description', 'summary', '简介'],
  tags: ['tags', 'keywords', '标签'],
};

function canonicalHeader(value) {
  const key = decodeHtml(value).toLowerCase().replace(/[\s_-]+/g, '');
  for (const [canonical, variants] of Object.entries(HEADERS)) if (variants.includes(key)) return canonical;
  return '';
}

function rowObjects(rows) {
  const clean = rows.map((row) => row.map((cell) => decodeHtml(cell)).filter((cell) => cell !== '')).filter((row) => row.length >= 2);
  if (!clean.length) return [];
  const mappedHeader = clean[0].map(canonicalHeader);
  const hasHeader = mappedHeader.includes('title') && mappedHeader.some(Boolean);
  const data = hasHeader ? clean.slice(1) : clean;
  return data.flatMap((cells) => {
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return [];
    const obj = {};
    if (hasHeader) mappedHeader.forEach((key, index) => { if (key && cells[index] !== undefined) obj[key] = cells[index]; });
    else {
      const first = cells[0].match(/^#?(\d{1,4})(?:[.、:：\s-]+(.+))?$/);
      if (!first) return [];
      obj.rank = first[1];
      obj.title = first[2] || cells[1] || '';
      const shift = first[2] ? 1 : 2;
      [obj.author, obj.genre, obj.words, obj.blurb] = [cells[shift] || '', cells[shift + 1] || '', cells[shift + 2] || '', cells.slice(shift + 3).join(' ')];
    }
    return obj.title ? [obj] : [];
  });
}

function parseHtmlRows(raw) {
  const rows = [];
  for (const tr of raw.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
    if (cells.length) rows.push(cells);
  }
  return rowObjects(rows);
}

function parseDelimitedRows(raw) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const candidates = ['\t', '|', ','];
  const delimiter = candidates.map((value) => ({ value, count: lines.slice(0, 5).reduce((n, line) => n + line.split(value).length - 1, 0) })).sort((a, b) => b.count - a.count)[0];
  if (!delimiter || delimiter.count === 0) return [];
  const rows = lines.map((line) => line.replace(/^\||\|$/g, '').split(delimiter.value).map((cell) => cell.trim()));
  return rowObjects(rows);
}

function parseRankText(raw, source = '导入文件', capturedAt = new Date().toISOString()) {
  let objects = [];
  try { objects = objectsDeep(JSON.parse(raw.replace(/^\uFEFF/, ''))); } catch (_) {
    const jsonl = raw.split(/\r?\n/).map((line) => { try { return JSON.parse(line); } catch (_) { return null; } }).filter(Boolean);
    if (jsonl.length) objects = objectsDeep(jsonl);
  }
  if (!objects.length && /<tr\b/i.test(raw)) objects = parseHtmlRows(raw);
  if (!objects.length) objects = parseDelimitedRows(raw);
  if (!objects.length) {
    const rows = stripHtml(raw).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
      const match = line.match(/^#?(\d{1,4})[.、:：\s-]+(.+)$/);
      return match ? [{ rank: match[1], title: match[2] }] : [];
    });
    objects = rows;
  }
  return objects.map((obj, index) => normalizeBook(obj, source, index + 1, capturedAt)).filter(Boolean);
}

function parseRankInput(file, source) {
  const target = path.resolve(file);
  if (!fs.existsSync(target)) throw new CliError('PATH_NOT_FOUND', `榜单文件不存在: ${target}`, { path: target });
  return parseRankText(fs.readFileSync(target, 'utf8'), source);
}

function atomicWrite(file, data, encoding = 'utf8') {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temp, data, encoding);
    fs.renameSync(temp, target);
  } catch (error) {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) { /* best effort */ }
    throw new CliError('ATOMIC_WRITE_FAILED', `原子写入失败: ${target}`, { path: target, cause: error.message });
  }
  return target;
}

function backupFile(file) {
  const source = path.resolve(file);
  let backup = `${source}.bak`;
  let index = 1;
  while (fs.existsSync(backup)) backup = `${source}.bak.${index++}`;
  fs.copyFileSync(source, backup, fs.constants.COPYFILE_EXCL);
  return backup;
}

function rankCli(source) {
  try {
    const input = process.argv[2];
    if (!input) throw new CliError('USAGE', `用法: node ${path.basename(process.argv[1])} <导出的 json/jsonl/html/csv/tsv/txt> [--jsonl]`);
    const rows = parseRankInput(input, source);
    if (!rows.length) throw new CliError('EMPTY_RANKING', '未从输入中解析出榜单条目', { input: path.resolve(input), source });
    if (process.argv.includes('--jsonl')) rows.forEach((row) => process.stdout.write(`${JSON.stringify(row)}\n`));
    else process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  } catch (error) {
    process.exitCode = emitError(error, path.basename(process.argv[1]));
  }
}

function countCli(input) {
  const rows = readDocuments(input).map(({ file, text }) => ({ file, ...countText(text) }));
  const total = rows.reduce((acc, row) => {
    for (const key of ['chinese_chars', 'non_whitespace_chars', 'paragraphs', 'dialogue_lines']) acc[key] += row[key];
    return acc;
  }, { chinese_chars: 0, non_whitespace_chars: 0, paragraphs: 0, dialogue_lines: 0 });
  process.stdout.write(`${JSON.stringify({ ok: true, files: rows, total }, null, 2)}\n`);
}

if (require.main === module) {
  try {
    const [command, input] = process.argv.slice(2);
    if (command !== 'count' || !input) throw new CliError('USAGE', '用法: node cap-utils.js count <章节或目录>');
    countCli(input);
  } catch (error) {
    process.exitCode = emitError(error, 'cap-utils');
  }
}

module.exports = { CliError, emitError, walkFiles, readDocuments, countText, parseRankText, parseRankInput, normalizeBook, objectsDeep, atomicWrite, backupFile, rankCli };
