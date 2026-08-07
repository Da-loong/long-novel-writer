#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError } = require('./cap-utils');

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) args[value.slice(2)] = argv[++index];
    else if (!args.project) args.project = value;
  }
  return args;
}

function readJson(file) {
  if (!fs.existsSync(file)) throw new CliError('EVIDENCE_MISSING', '证据文件不存在', { file });
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new CliError('EVIDENCE_JSON_INVALID', '证据文件不是有效 JSON', { file, message: error.message }); }
}

function sourceFile(project, relativePath) {
  const target = path.resolve(project, relativePath);
  const containment = path.relative(project, target);
  if (containment.startsWith('..') || path.isAbsolute(containment)) throw new CliError('EVIDENCE_PATH_ESCAPE', '证据路径超出项目目录', { path: relativePath });
  return target;
}

function evidenceOf(project, item, location) {
  if (!item || typeof item !== 'object' || typeof item.path !== 'string' || typeof item.quote !== 'string' || item.quote.trim().length < 2) return { ok: false, location, code: 'EVIDENCE_SHAPE', detail: '每条证据必须有 path 与可检索 quote' };
  const file = sourceFile(project, item.path);
  if (!fs.existsSync(file)) return { ok: false, location, code: 'EVIDENCE_FILE_MISSING', detail: item.path };
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(item.quote)) return { ok: false, location, code: 'EVIDENCE_QUOTE_MISSING', detail: `${item.path}: ${item.quote}` };
  return { ok: true, path: item.path, quote: item.quote };
}

function validate(projectInput, input) {
  const project = path.resolve(projectInput);
  if (!input || typeof input !== 'object') throw new CliError('EVIDENCE_SHAPE', '证据根节点必须是对象');
  const errors = [];
  const anchors = Array.isArray(input.target_anchors) ? input.target_anchors : [];
  const findings = Array.isArray(input.findings) ? input.findings : [];
  if (!anchors.length) errors.push({ code: 'ANCHORS_MISSING', detail: '至少提供一个 target_anchors' });
  for (const [index, anchor] of anchors.entries()) {
    const location = `target_anchors[${index}]`;
    if (!anchor || !anchor.id || !anchor.target) errors.push({ code: 'ANCHOR_SHAPE', detail: location });
    const status = anchor?.status || 'unknown';
    if (!['fulfilled', 'deferred', 'broken', 'unknown'].includes(status)) errors.push({ code: 'ANCHOR_STATUS', detail: `${location}: ${status}` });
    if (status === 'deferred' && !anchor.deadline) errors.push({ code: 'ANCHOR_DEADLINE_MISSING', detail: location });
    if (status === 'broken' || status === 'unknown') errors.push({ code: 'ANCHOR_NOT_VERIFIED', detail: `${location}: ${status}` });
    const evidence = Array.isArray(anchor?.evidence) ? anchor.evidence : [];
    if ((status === 'fulfilled' || status === 'deferred') && !evidence.length) errors.push({ code: 'ANCHOR_EVIDENCE_MISSING', detail: location });
    for (const [evidenceIndex, item] of evidence.entries()) {
      const report = evidenceOf(project, item, `${location}.evidence[${evidenceIndex}]`);
      if (!report.ok) errors.push(report);
    }
  }
  for (const [index, finding] of findings.entries()) {
    const location = `findings[${index}]`;
    const severity = finding?.severity || 'info';
    if (!['info', 'warn', 'high', 'critical'].includes(severity)) errors.push({ code: 'FINDING_SEVERITY', detail: `${location}: ${severity}` });
    const evidence = Array.isArray(finding?.evidence) ? finding.evidence : [];
    if (severity !== 'info' && !evidence.length) errors.push({ code: 'FINDING_EVIDENCE_MISSING', detail: location });
    for (const [evidenceIndex, item] of evidence.entries()) {
      const report = evidenceOf(project, item, `${location}.evidence[${evidenceIndex}]`);
      if (!report.ok) errors.push(report);
    }
  }
  const readerReports = Array.isArray(input.reader_reports) ? input.reader_reports : [];
  for (const [index, report] of readerReports.entries()) {
    if (!report || typeof report.summary !== 'string' || !Array.isArray(report.confusions) || typeof report.continue_next !== 'boolean') errors.push({ code: 'READER_REPORT_SHAPE', detail: `reader_reports[${index}] 需要 summary/confusions/continue_next` });
  }
  const verifiedAnchors = anchors.filter((anchor) => ['fulfilled', 'deferred'].includes(anchor?.status)).length;
  const coverage = anchors.length ? Number((verifiedAnchors / anchors.length).toFixed(4)) : 0;
  const criticalFailures = findings.filter((finding) => ['high', 'critical'].includes(finding?.severity)).length + anchors.filter((anchor) => ['broken', 'unknown'].includes(anchor?.status)).length;
  return { ok: errors.length === 0, project, reviewed_through: Number(input.reviewed_through || 0), anchors: anchors.length, verified_anchors: verifiedAnchors, anchor_coverage: coverage, reader_reports: readerReports.length, critical_failures: criticalFailures, errors };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project || !args.input) throw new CliError('USAGE', '用法: node evidence-audit.js <项目目录> --input <证据 JSON>');
  const report = validate(args.project, readJson(path.resolve(args.project, args.input)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 3;
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'evidence-audit'); }
}

module.exports = { argsOf, sourceFile, evidenceOf, validate, run };
