#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError, readDocuments, backupFile, atomicWrite } = require('./cap-utils');

function normalize(text) {
  return text
    .replace(/\.\.\.+/g, '……')
    .replace(/--+/g, '——')
    .replace(/([\u3400-\u9fff])\s*,\s*/g, '$1，')
    .replace(/([\u3400-\u9fff])\s*;\s*/g, '$1；')
    .replace(/([\u3400-\u9fff])\s*:\s*/g, '$1：')
    .replace(/([\u3400-\u9fff])\s*\?+/g, '$1？')
    .replace(/([\u3400-\u9fff])\s*!+/g, '$1！')
    .replace(/[ \t]+$/gm, '');
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function run(argv = process.argv.slice(2)) {
  const input = argv[0];
  const check = argv.includes('--check');
  const write = argv.includes('--write');
  const outDir = option(argv, '--out-dir');
  if (!input || Number(check) + Number(write) !== 1) throw new CliError('USAGE', '用法: node normalize-punctuation.js <章节或目录> --check | --write [--out-dir 目录]');
  const inputPath = path.resolve(input);
  const root = fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory() ? inputPath : path.dirname(inputPath);
  const files = [];
  for (const { file, text } of readDocuments(input)) {
    const next = normalize(text);
    if (next === text) continue;
    const item = { file, changed: true };
    if (write) {
      if (outDir) {
        const relative = path.relative(root, file);
        if (relative.startsWith('..')) throw new CliError('PATH_ESCAPE', '输出文件超出输入根目录', { file });
        item.output = atomicWrite(path.join(path.resolve(outDir), relative), next);
      } else {
        item.backup = backupFile(file);
        item.output = atomicWrite(file, next);
      }
    }
    files.push(item);
  }
  const report = { ok: true, mode: check ? 'check' : 'write', changed: files.length, files };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'normalize-punctuation'); }
}

module.exports = { normalize, run };
