#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError, readDocuments } = require('./cap-utils');

function bodyOf(text) {
  return String(text)
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .trim();
}

function chineseChars(text) { return (String(text).match(/[\u3400-\u9fff]/g) || []).length; }

function quotedChars(text) {
  let total = 0;
  const patterns = [/[“「『]([^”」』\r\n]*)[”」』]/g, /"([^"\r\n]*)"/g];
  for (const pattern of patterns) {
    for (const match of String(text).matchAll(pattern)) total += chineseChars(match[1]);
  }
  return total;
}

function paragraphsOf(body) { return body.split(/\r?\n\s*\r?\n/).map((item) => item.trim()).filter(Boolean); }

function firstActionIndex(body) {
  const signals = /冲进|冲出|跑|追|打|砸|摔|门开|门被|手机响|电话|停电|出事|血|必须|来不及|有人|倒下|抓住|逃|爆炸|敲门|醒来|发现/;
  const paragraphs = paragraphsOf(body);
  let chars = 0;
  for (const paragraph of paragraphs) {
    if (signals.test(paragraph)) return chars;
    chars += chineseChars(paragraph);
  }
  return chars;
}

function expositionRuns(body) {
  const paragraphs = paragraphsOf(body);
  const flags = paragraphs.map((paragraph) => chineseChars(paragraph) >= 120 && quotedChars(paragraph) === 0);
  let current = 0; let longest = 0;
  for (const flag of flags) { current = flag ? current + 1 : 0; longest = Math.max(longest, current); }
  return { longest, qualifying_paragraphs: flags.filter(Boolean).length };
}

function analyzeText(file, text) {
  const body = bodyOf(text);
  const paragraphs = paragraphsOf(body);
  const chinese = chineseChars(body);
  const dialogue = quotedChars(body);
  const run = expositionRuns(body);
  const openingActionChars = firstActionIndex(body);
  const last = paragraphs.at(-1) || '';
  const warnings = [];
  if (openingActionChars > 300) warnings.push({ code: 'OPENING_ACTION_DELAY', detail: `前 ${openingActionChars} 个中文字符才出现动作/问题信号` });
  if (run.longest >= 2) warnings.push({ code: 'EXPOSITION_BLOCK', detail: `连续 ${run.longest} 段长解释，需检查是否在朗读设定` });
  if (chinese > 0 && dialogue / chinese > 0.4) warnings.push({ code: 'DIALOGUE_OVERFLOW', detail: `对白中文字符占比 ${(dialogue / chinese * 100).toFixed(1)}%` });
  if (chineseChars(last) >= 80 && !/[？！?!。]$/.test(last)) warnings.push({ code: 'WEAK_ENDING_SHAPE', detail: '章尾长段没有明显动作、问题或句号收束以外的形状变化' });
  return {
    file: path.resolve(file), chinese_chars: chinese, paragraphs: paragraphs.length,
    dialogue_chars: dialogue, dialogue_ratio: chinese ? Number((dialogue / chinese).toFixed(4)) : 0,
    opening_action_delay_chars: openingActionChars, exposition: run,
    ending_chars: chineseChars(last), warnings,
    reader_pass: warnings.length === 0,
  };
}

function run(input) {
  if (!input) throw new CliError('USAGE', '用法: node reader-metrics.js <章节或目录>');
  const reports = readDocuments(input).map(({ file, text }) => analyzeText(file, text));
  return { ok: true, reports, warnings: reports.flatMap((report) => report.warnings.map((warning) => ({ file: report.file, ...warning }))) };
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(run(process.argv[2]), null, 2)}\n`); }
  catch (error) { process.exitCode = emitError(error, 'reader-metrics'); }
}

module.exports = { bodyOf, chineseChars, quotedChars, paragraphsOf, expositionRuns, analyzeText, run };
