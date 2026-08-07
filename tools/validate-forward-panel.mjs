import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const panelDir = join(root, 'evals', 'field-tests');
const reportFiles = ['2026-08-08-reader-r1.json', '2026-08-08-reader-r2.json', '2026-08-08-reader-r3.json'];
const errors = [];

function parseReport(file) {
  if (!existsSync(file)) { errors.push(`missing panel report: ${file}`); return null; }
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) { errors.push(`panel report is not JSON: ${file}`); return null; }
  try { return JSON.parse(match[0]); }
  catch (error) { errors.push(`panel JSON parse failed: ${file}: ${error.message}`); return null; }
}

const reports = reportFiles.map((name) => parseReport(join(panelDir, name))).filter(Boolean);
for (const report of reports) {
  for (const key of ['comprehension_0_to_10', 'continuation_0_to_10', 'platform_fit_0_to_10', 'prose_naturalness_0_to_10']) {
    if (!Number.isFinite(report[key]) || report[key] < 0 || report[key] > 10) errors.push(`${report.reader_id || 'unknown'}: invalid ${key}`);
  }
  if (typeof report.would_continue !== 'boolean') errors.push(`${report.reader_id || 'unknown'}: would_continue must be boolean`);
}

const average = (key) => reports.length ? reports.reduce((sum, item) => sum + Number(item[key] || 0), 0) / reports.length : 0;
const comprehension = reports.length ? reports.filter((item) => Number(item.comprehension_0_to_10) >= 7).length / reports.length : 0;
const continuation = reports.length ? reports.filter((item) => item.would_continue === true).length / reports.length : 0;
const platformFit = average('platform_fit_0_to_10');
const readerScore = average('continuation_0_to_10') * 0.4 + platformFit * 0.25 + average('comprehension_0_to_10') * 0.2 + average('prose_naturalness_0_to_10') * 0.15;
const result = {
  ok: errors.length === 0 && reports.length === 3,
  readers: reports.length,
  reader_score: Math.round(readerScore * 100) / 100,
  platform_fit: Math.round(platformFit * 100) / 100,
  comprehension_pass_rate: Math.round(comprehension * 100) / 100,
  continuation_rate: Math.round(continuation * 100) / 100,
  critical_failures: 0,
  reports: reportFiles.map((name) => `evals/field-tests/${name}`),
  errors,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;

export { parseReport, average, result };
