import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const acceptance = JSON.parse(readFileSync(join(root, 'evals', 'acceptance.json'), 'utf8'));
const currentPath = join(root, 'evals', 'current.json');
const baselinePath = join(root, 'evals', 'baseline.json');
const result = existsSync(currentPath) ? JSON.parse(readFileSync(currentPath, 'utf8')) : JSON.parse(readFileSync(baselinePath, 'utf8'));

const errors = [];
const evidenceErrors = [];
const forbiddenEvidence = new Set(['model_self_rating', 'readme_claim', 'file_count']);
const evidenceRequiringPassingTests = new Set(['test', 'scenario']);
function walk(dir, predicate, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) walk(target, predicate, files);
    else if (predicate(target)) files.push(target);
  }
  return files.sort();
}
function hashFiles(files) {
  const hash = createHash('sha256');
  for (const file of files) { hash.update(relative(root, file).replace(/\\/g, '/')); hash.update('\0'); hash.update(readFileSync(file)); hash.update('\0'); }
  return hash.digest('hex');
}
const testRunPath = join(root, 'evals', 'test-run.json');
let passingTestRun = false;
if (existsSync(testRunPath)) {
  const run = JSON.parse(readFileSync(testRunPath, 'utf8'));
  const tests = walk(join(root, 'tests'), (file) => file.endsWith('.test.js'));
  const sources = walk(join(root, 'skill', 'long-novel-writer'), (file) => ['.js', '.md', '.json', '.yaml'].includes(extname(file).toLowerCase()));
  passingTestRun = run.exit_code === 0 && run.test_suite_sha256 === hashFiles(tests) && run.skill_source_sha256 === hashFiles(sources);
  if (!passingTestRun) evidenceErrors.push('test-run.json is stale or failed');
} else if (result.dimensions) evidenceErrors.push('missing evals/test-run.json; run npm test first');
let computedScore = Number(result.score || 0);
if (result.dimensions) {
  const dimensions = new Map(result.dimensions.map((item) => [item.id, item]));
  computedScore = 0;
  for (const expected of acceptance.dimensions) {
    const actual = dimensions.get(expected.id);
    if (!actual) { errors.push(`missing dimension: ${expected.id}`); continue; }
    if (!Number.isFinite(actual.score) || actual.score < 0 || actual.score > 10) errors.push(`invalid score: ${expected.id}`);
    if (!Array.isArray(actual.evidence) || actual.evidence.length === 0) errors.push(`missing evidence: ${expected.id}`);
    else {
      for (const evidence of actual.evidence) {
        if (!evidence || typeof evidence !== 'object' || !evidence.type || !evidence.path) { evidenceErrors.push(`${expected.id}: malformed evidence`); continue; }
        if (forbiddenEvidence.has(evidence.type)) evidenceErrors.push(`${expected.id}: forbidden evidence type ${evidence.type}`);
        const target = resolve(root, evidence.path);
        if (!existsSync(target)) evidenceErrors.push(`${expected.id}: missing ${evidence.path}`);
        else if (evidence.case && !readFileSync(target, 'utf8').includes(evidence.case)) evidenceErrors.push(`${expected.id}: case not found in ${evidence.path}: ${evidence.case}`);
        if (evidenceRequiringPassingTests.has(evidence.type) && !passingTestRun) evidenceErrors.push(`${expected.id}: test evidence has no current passing run`);
      }
      if (actual.score >= 8.5 && actual.evidence.length < 2) evidenceErrors.push(`${expected.id}: score >= 8.5 needs at least two evidence items`);
    }
    computedScore += Number(actual.score || 0) * expected.weight;
  }
}
computedScore = Math.round(computedScore * 100) / 100;

const blockers = (result.issues || []).filter((issue) => acceptance.blockingSeverities.includes(issue.severity) && issue.status !== 'closed');
const belowMinimum = acceptance.dimensions.flatMap((expected) => {
  const actual = result.dimensions?.find((item) => item.id === expected.id);
  return actual && actual.score < expected.minimum ? [{ id: expected.id, score: actual.score, minimum: expected.minimum }] : [];
});
const releaseReady = errors.length === 0 && evidenceErrors.length === 0 && blockers.length === 0 && belowMinimum.length === 0 && computedScore >= acceptance.releaseThreshold;
const report = { version: result.version, source: existsSync(currentPath) ? 'current' : 'baseline', computedScore, threshold: acceptance.releaseThreshold, releaseReady, currentPassingTestRun: passingTestRun, blockers, belowMinimum, validationErrors: errors, evidenceErrors };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (errors.length || evidenceErrors.length || (process.argv.includes('--release') && !releaseReady)) process.exitCode = 1;
