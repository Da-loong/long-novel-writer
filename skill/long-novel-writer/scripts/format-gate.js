#!/usr/bin/env node
'use strict';

/* Mobile-first manuscript format and anti-logline/流水账 preflight. */
const fs = require('fs');
const path = require('path');
const { CliError, emitError, readDocuments } = require('./cap-utils');

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) args[value.slice(2)] = argv[++index] ?? true;
    else if (!args.input) args.input = value;
  }
  return args;
}

function bodyOf(text) {
  return String(text)
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/^```[\s\S]*?```\s*/gm, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .trim();
}

function chineseChars(text) { return (String(text).match(/[\u3400-\u9fff]/g) || []).length; }
function paragraphsOf(body) { return body.split(/\r?\n\s*\r?\n/).map((item) => item.trim()).filter(Boolean); }

const sequenceOpeners = /^(?:然后|接着|随后|紧接着|之后|过了一会儿|第二天|第三天|不久后|他先|他又|他再|众人|一行人)/;
// Keep this list deliberately concrete: a paragraph should show a visible
// move, choice, or reaction rather than only reporting that time passed.
const actionWords = /(?:冲|奔|抓|抢|推|伸手|抬手|拔|砸|撞|让开|扣住|掉进|亮起|转身|侧身|停下|逼近|选择|决定|发现|拒绝|答应|开口|喊|问|盯|看见|按住|后退|扑)/;
const resultWords = /(?:却|但|于是|结果|因此|不料|发现|终于|只见|下一秒|立刻|当场|换来|失去|拿到|暴露)/;

function startsOf(paragraphs) {
  return paragraphs.map((paragraph) => paragraph.replace(/[“”"「」『』\s]/g, '').slice(0, 6)).filter(Boolean);
}

function repeatedStarts(starts) {
  const counts = new Map();
  for (const start of starts) counts.set(start, (counts.get(start) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([start, count]) => ({ start, count }));
}

function analyze(file, text, options = {}) {
  const source = String(text).replace(/^\uFEFF/, '');
  const body = bodyOf(source);
  const paragraphs = paragraphsOf(body);
  const errors = [];
  const warnings = [];
  const add = (severity, code, detail, evidence = {}) => (severity === 'error' ? errors : warnings).push({ severity, code, detail, ...evidence });
  const headingLines = source.split(/\r?\n/).filter((line) => /^#{1,6}\s+/.test(line));
  const codeFence = /```/.test(source);
  const tableLine = source.split(/\r?\n/).find((line) => /^\s*\|.*\|\s*$/.test(line));
  const listLine = source.split(/\r?\n/).find((line) => /^\s*(?:[-*+] |\d+[.)] )/.test(line));
  const blankRuns = source.match(/\n{3,}/g) || [];
  if (headingLines.length > 1) add('error', 'EXTRA_MANUSCRIPT_HEADINGS', '正文只能保留章节标题，不能把小标题、提纲标题带进发布稿');
  if (codeFence) add('error', 'MARKDOWN_FENCE_IN_MANUSCRIPT', '正文包含代码围栏');
  if (tableLine) add('error', 'MARKDOWN_TABLE_IN_MANUSCRIPT', '正文包含 Markdown 表格');
  if (listLine) add('error', 'LIST_MARKUP_IN_MANUSCRIPT', '正文包含列表标记，像提纲而不是连续叙事');
  if (blankRuns.length) add('error', 'EXCESS_BLANK_LINES', '段落之间只能保留一个空行', { count: blankRuns.length });
  if (!headingLines.length) warnings.push({ severity: 'warning', code: 'CHAPTER_TITLE_MISSING', detail: '建议保留一个章节标题，导出时可单独去除' });

  const maxParagraph = Number(options['max-paragraph-chars'] || 260);
  const lengths = paragraphs.map(chineseChars);
  const longParagraphs = lengths.map((length, index) => ({ length, index: index + 1 })).filter((item) => item.length > maxParagraph);
  for (const item of longParagraphs) add('error', 'PARAGRAPH_TOO_LONG', `第 ${item.index} 段有 ${item.length} 个中文字符，超过移动端阅读阈值 ${maxParagraph}`, item);
  const sentenceLengths = body.split(/[。！？!?；;]/).map(chineseChars).filter((length) => length > 0);
  const longSentences = sentenceLengths.filter((length) => length > Number(options['max-sentence-chars'] || 100));
  if (longSentences.length) add('warning', 'SENTENCE_TOO_LONG', `${longSentences.length} 个句子超过 100 字，优先拆分动作、反应和结果`);

  const starts = startsOf(paragraphs);
  const repeats = repeatedStarts(starts);
  const maxRepeated = repeats[0]?.count || 0;
  const sameStartRatio = paragraphs.length ? maxRepeated / paragraphs.length : 0;
  const openerCount = paragraphs.filter((paragraph) => sequenceOpeners.test(paragraph)).length;
  const actionCount = paragraphs.filter((paragraph) => actionWords.test(paragraph)).length;
  const resultCount = paragraphs.filter((paragraph) => resultWords.test(paragraph)).length;
  const quotedParagraphs = paragraphs.filter((paragraph) => /[“"「『]/.test(paragraph)).length;
  const flow = {
    paragraphs: paragraphs.length,
    max_repeated_start: maxRepeated,
    same_start_ratio: Number(sameStartRatio.toFixed(3)),
    sequence_opener_count: openerCount,
    action_paragraphs: actionCount,
    result_paragraphs: resultCount,
    dialogue_paragraphs: quotedParagraphs,
  };
  if (paragraphs.length >= 6 && openerCount >= 4 && openerCount / paragraphs.length >= 0.45) {
    add('error', '流水账_SEQUENCE_CHAIN', `连续叙述段落中有 ${openerCount}/${paragraphs.length} 段以时间连接词起步；改成“目标—阻力—选择—结果”推进`, { flow });
  }
  if (paragraphs.length >= 8 && sameStartRatio >= 0.45 && actionCount / paragraphs.length < 0.5) {
    add('error', '流水账_SUBJECT_CHAIN', `最多 ${maxRepeated} 段使用相同段首且有效行动不足；需要加入对抗、反应或选择`, { flow });
  }
  if (paragraphs.length >= 8 && actionCount / paragraphs.length < 0.25 && resultCount / paragraphs.length < 0.2) {
    add('warning', '流水账_LOW_EVENT_DENSITY', '动作与结果信号偏少，可能是按时间顺序罗列经过；人工复核本章因果链', { flow });
  }
  if (paragraphs.length >= 8 && quotedParagraphs === 0) add('warning', 'DIALOGUE_ABSENT', '整章没有对白；若题材需要互动，请补充有目的的对话或明确保持无对白的叙事策略');

  return {
    ok: errors.length === 0,
    schema_version: '1.0',
    file: path.resolve(file),
    body_chinese_chars: chineseChars(body),
    paragraph_count: paragraphs.length,
    paragraph_lengths: lengths,
    layout: { heading_count: headingLines.length, code_fence: codeFence, table_line: Boolean(tableLine), list_line: Boolean(listLine), excess_blank_lines: blankRuns.length, max_paragraph_chars: maxParagraph },
    flow,
    errors,
    warnings,
  };
}

function run(input, options = {}) {
  if (!input) throw new CliError('USAGE', 'Usage: node format-gate.js <chapter-or-directory> [--json]');
  const reports = readDocuments(input).map(({ file, text }) => analyze(file, text, options));
  const report = { ok: reports.every((item) => item.ok), reports, errors: reports.flatMap((item) => item.errors.map((error) => ({ file: item.file, ...error }))), warnings: reports.flatMap((item) => item.warnings.map((warning) => ({ file: item.file, ...warning }))) };
  if (options.json || process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { const args = argsOf(process.argv.slice(2)); const report = run(args.input, args); if (!report.ok) process.exitCode = 3; }
  catch (error) { process.exitCode = emitError(error, 'format-gate'); }
}

module.exports = { argsOf, bodyOf, chineseChars, paragraphsOf, startsOf, repeatedStarts, analyze, run };
