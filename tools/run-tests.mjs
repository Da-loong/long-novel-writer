import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');

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

const tests = walk(join(root, 'tests'), (file) => file.endsWith('.test.js'));
const sources = walk(join(root, 'skill', 'long-novel-writer'), (file) => ['.js', '.md', '.json', '.yaml'].includes(extname(file).toLowerCase()));
const startedAt = new Date().toISOString();
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
const artifact = {
  schema_version: '1.0', started_at: startedAt, completed_at: new Date().toISOString(), exit_code: result.status,
  node: process.version, platform: process.platform, arch: process.arch, test_files: tests.length,
  test_suite_sha256: hashFiles(tests), skill_source_sha256: hashFiles(sources),
};
writeFileSync(join(root, 'evals', 'test-run.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
if (result.status !== 0) process.exitCode = result.status || 1;

export { walk, hashFiles };
