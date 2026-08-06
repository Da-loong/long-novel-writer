#!/usr/bin/env node
'use strict';

const path = require('path');
const { CliError, emitError, readDocuments, countText } = require('./cap-utils');

function analyze(file, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/(?:TODO|TBD|待补|此处略|若干字|省略|占位|待续)/i.test(line)) findings.push({ rule: '占位内容', line: i + 1, excerpt: line.trim().slice(0, 120) });
    if (/([！？。，])\1{2,}/.test(line)) findings.push({ rule: '标点堆叠', line: i + 1, excerpt: line.trim().slice(0, 120) });
  });
  const paras = text.split(/\r?\n\s*\r?\n/).map(x => x.trim()).filter(x => x.length >= 20);
  const seen = new Map();
  paras.forEach((p, i) => {
    const key = p.replace(/\s+/g, '');
    if (seen.has(key)) findings.push({ rule: '重复段落', line: null, excerpt: `段 ${seen.get(key) + 1} 与段 ${i + 1}: ${p.slice(0, 80)}` });
    else seen.set(key, i);
  });
  const counts = countText(text);
  if (counts.chinese_chars < 500) findings.push({ rule: '篇幅异常', line: null, excerpt: `有效中文字符仅 ${counts.chinese_chars}` });
  return { file: path.resolve(file), counts, findings };
}

function run(argv = process.argv.slice(2)) {
  const input = argv[0];
  if (!input) throw new CliError('USAGE', '用法: node check-degeneration.js <章节或目录> [--json]');
  const reports = readDocuments(input).map(x => analyze(x.file, x.text));
  const total = reports.reduce((n, r) => n + r.findings.length, 0);
  if (argv.includes('--json')) console.log(JSON.stringify({ ok: true, total, reports }, null, 2));
  else {
    for (const r of reports) for (const f of r.findings) console.log(`${r.file}:${f.line || '-'} [${f.rule}] ${f.excerpt}`);
    console.log(`共 ${total} 条退化/完整性线索。`);
  }
  return { ok: true, total, reports };
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'check-degeneration'); }
}

module.exports = { analyze, run };
