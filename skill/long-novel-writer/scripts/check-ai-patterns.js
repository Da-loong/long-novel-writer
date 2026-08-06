#!/usr/bin/env node
'use strict';

const path = require('path');
const { CliError, emitError, readDocuments } = require('./cap-utils');

const patterns = [
  ['空泛强调', /(?:值得一提的是|毋庸置疑|显而易见|不可否认的是|某种意义上)/g],
  ['心理代述', /(?:他|她)(?:不由得|下意识地?|清楚地意识到|心中不禁|内心深处)/g],
  ['陈套意象', /(?:空气仿佛凝固|时间仿佛静止|心中五味杂陈|眼神中闪过一丝)/g],
  ['同构转折', /不是[^。！？\n]{1,40}而是/g],
  ['模板连接', /(?:与此同时|紧接着|就在这时|下一秒|这一刻)[，,]/g],
  ['章尾总结', /(?:这一刻.{0,50}(?:明白|知道)|未来.{0,40}(?:等待|注定)|一切.{0,30}(?:开始|结束))[。！？]?\s*$/gm],
];

function lineOf(text, index) { return text.slice(0, index).split(/\r?\n/).length; }

function analyze(file, text) {
  const findings = [];
  for (const [rule, regex] of patterns) {
    regex.lastIndex = 0;
    const matches = [...text.matchAll(regex)];
    if (rule === '同构转折' && matches.length < 2) continue;
    for (const m of matches) findings.push({ rule, line: lineOf(text, m.index), excerpt: m[0].slice(0, 100) });
  }
  const starts = new Map();
  for (const sentence of text.split(/[。！？\n]+/).map(x => x.trim()).filter(x => x.length >= 8)) {
    const start = sentence.slice(0, 4);
    starts.set(start, (starts.get(start) || 0) + 1);
  }
  for (const [start, count] of starts) if (count >= 4) findings.push({ rule: '句首重复', line: null, excerpt: `${start}… × ${count}` });
  return { file: path.resolve(file), findings };
}

function run(argv = process.argv.slice(2)) {
  const input = argv[0];
  if (!input) throw new CliError('USAGE', '用法: node check-ai-patterns.js <章节或目录> [--json]');
  const reports = readDocuments(input).map(x => analyze(x.file, x.text));
  const total = reports.reduce((n, r) => n + r.findings.length, 0);
  if (argv.includes('--json')) console.log(JSON.stringify({ ok: true, total, reports }, null, 2));
  else {
    for (const r of reports) for (const f of r.findings) console.log(`${r.file}:${f.line || '-'} [${f.rule}] ${f.excerpt}`);
    console.log(`共 ${total} 条线索；命中需结合上下文人工判断。`);
  }
  return { ok: true, total, reports };
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'check-ai-patterns'); }
}

module.exports = { analyze, run };
