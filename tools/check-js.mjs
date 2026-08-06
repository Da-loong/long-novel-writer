import { readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const roots = ['skill', 'tests', 'tools'].map((name) => join(root, name));
const extensions = new Set(['.js', '.mjs', '.cjs']);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const target = join(dir, entry.name);
    if (entry.isDirectory()) walk(target, files);
    else if (extensions.has(extname(entry.name))) files.push(target);
  }
  return files;
}

const files = roots.flatMap((dir) => walk(dir)).sort();
const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push({ file: relative(root, file), message: (result.stderr || result.stdout).trim() });
}

const report = { ok: failures.length === 0, checked: files.length, failures };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
