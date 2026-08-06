#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

const SOURCE_EXT = new Set(['.md', '.txt']);
const DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function chineseNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  let total = 0; let current = 0;
  for (const char of value) {
    if (DIGITS[char] !== undefined) current = DIGITS[char];
    else if (char === '十') { total += (current || 1) * 10; current = 0; }
    else if (char === '百') { total += (current || 1) * 100; current = 0; }
    else if (char === '千') { total += (current || 1) * 1000; current = 0; }
    else return null;
  }
  return total + current || null;
}

function walk(dir, root = dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, root, files);
    else if (SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) files.push({ absolute: target, relative: path.relative(root, target).replace(/\\/g, '/') });
  }
  return files;
}

function inspectFile(file) {
  const buffer = fs.readFileSync(file.absolute);
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const chapters = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.trim().match(/^(?:#{1,6}\s*)?第\s*([零〇一二两三四五六七八九十百千\d]+)\s*章(?:\s+|[：:、-]?)(.*)$/);
    if (match) chapters.push({ number: chineseNumber(match[1]), raw_number: match[1], title: match[2].trim(), line: index + 1 });
  });
  const paragraphs = text.split(/\r?\n\s*\r?\n/).map((item) => item.replace(/\s+/g, '')).filter((item) => item.length >= 50);
  const duplicateParagraphs = paragraphs.length - new Set(paragraphs).size;
  return {
    path: file.relative,
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    chinese_chars: (text.match(/[\u3400-\u9fff]/g) || []).length,
    encoding_damage: text.includes('\uFFFD'),
    chapters,
    duplicate_paragraphs: duplicateParagraphs,
  };
}

function inventory(sourceInput) {
  const source = path.resolve(sourceInput);
  if (!fs.existsSync(source)) throw new CliError('PATH_NOT_FOUND', `旧稿路径不存在: ${source}`, { path: source });
  const stat = fs.statSync(source);
  const files = stat.isFile() ? [{ absolute: source, relative: path.basename(source) }] : walk(source);
  if (!files.length) throw new CliError('NO_SOURCE_FILES', '未找到 Markdown 或 TXT 旧稿', { source });
  const inspected = files.sort((a, b) => a.relative.localeCompare(b.relative)).map(inspectFile);
  const chapterRows = inspected.flatMap((file) => file.chapters.map((chapter) => ({ ...chapter, source: file.path })));
  const known = chapterRows.filter((item) => Number.isFinite(item.number)).map((item) => item.number).sort((a, b) => a - b);
  const gaps = [];
  for (let number = known[0] || 0; number <= (known.at(-1) || -1); number++) if (!known.includes(number)) gaps.push(number);
  const duplicates = [...new Set(known.filter((number, index) => known.indexOf(number) !== index))];
  return {
    schema_version: '1.0', source, captured_at: new Date().toISOString(), files: inspected, chapters: chapterRows,
    diagnostics: { file_count: inspected.length, chapter_heading_count: chapterRows.length, gaps, duplicate_chapter_numbers: duplicates, encoding_damage_files: inspected.filter((file) => file.encoding_damage).map((file) => file.path), duplicate_paragraphs: inspected.reduce((sum, file) => sum + file.duplicate_paragraphs, 0) },
  };
}

function sourceMap(report) {
  const rows = report.chapters.length ? report.chapters.map((chapter) => `| ${chapter.number ?? '未知'} | ${chapter.title || '（无标题）'} | ${chapter.source}:${chapter.line} | 待映射 |`).join('\n') : '| 未识别 | 未识别章节标题 | 见 inventory.json | 人工划分 |';
  return `# 旧稿来源映射\n\n- 来源：${report.source}\n- 清点时间：${report.captured_at}\n- 文件数：${report.diagnostics.file_count}\n- 识别章节标题：${report.diagnostics.chapter_heading_count}\n- 缺章号：${report.diagnostics.gaps.join('、') || '未发现'}\n- 重复章号：${report.diagnostics.duplicate_chapter_numbers.join('、') || '未发现'}\n- 编码损坏文件：${report.diagnostics.encoding_damage_files.join('、') || '未发现'}\n\n| 原章号 | 原标题 | 来源位置 | 目标章号 |\n|---:|---|---|---|\n${rows}\n`;
}

function run(argv = process.argv.slice(2)) {
  const source = argv[0];
  const projectIndex = argv.indexOf('--project');
  const project = projectIndex >= 0 ? argv[projectIndex + 1] : null;
  if (!source || !project) throw new CliError('USAGE', '用法: node import-inventory.js <旧稿文件或目录> --project <项目目录>');
  const projectPath = path.resolve(project);
  if (!fs.existsSync(projectPath)) throw new CliError('PATH_NOT_FOUND', `项目不存在: ${projectPath}`, { path: projectPath });
  const report = inventory(source);
  const inventoryPath = atomicWrite(path.join(projectPath, 'import', 'inventory.json'), `${JSON.stringify(report, null, 2)}\n`);
  const mapPath = atomicWrite(path.join(projectPath, 'import', 'source-map.md'), sourceMap(report));
  const result = { ok: true, inventory: inventoryPath, source_map: mapPath, diagnostics: report.diagnostics };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'import-inventory'); }
}

module.exports = { chineseNumber, walk, inspectFile, inventory, sourceMap, run };
