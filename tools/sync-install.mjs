import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const source = join(root, 'skill', 'long-novel-writer');

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) walk(target, files); else files.push(target);
  }
  return files.sort();
}

function treeHash(dir) {
  const hash = createHash('sha256');
  const files = walk(dir);
  for (const file of files) {
    hash.update(relative(dir, file).replace(/\\/g, '/')); hash.update('\0'); hash.update(readFileSync(file)); hash.update('\0');
  }
  return { sha256: hash.digest('hex'), files: files.length };
}

function targetsOf(argv) {
  const targets = [];
  for (let index = 0; index < argv.length; index++) if (argv[index] === '--target') targets.push(resolve(argv[++index]));
  if (!targets.length) targets.push(join(homedir(), '.codex', 'skills', 'long-novel-writer'));
  return targets;
}

function assertEphemeral(candidate, parent, prefix) {
  if (resolve(dirname(candidate)) !== resolve(parent) || !basename(candidate).startsWith(prefix)) throw new Error(`unsafe ephemeral path: ${candidate}`);
}

function mirrorInPlace(from, to) {
  const root = resolve(to);
  if (basename(root) !== 'long-novel-writer') throw new Error(`unsafe mirror target: ${root}`);
  mkdirSync(root, { recursive: true });
  const sourceFiles = new Map(walk(from).map((file) => [relative(from, file).replace(/\\/g, '/'), file]));
  const destinationFiles = walk(root);
  for (const file of destinationFiles) {
    const resolved = resolve(file);
    const containment = relative(root, resolved);
    if (containment.startsWith('..') || isAbsolute(containment)) throw new Error(`path escaped mirror target: ${file}`);
    if (lstatSync(file).isSymbolicLink()) throw new Error(`symbolic links are not supported in install target: ${file}`);
    const name = relative(root, file).replace(/\\/g, '/');
    if (!sourceFiles.has(name)) unlinkSync(file);
  }
  for (const [name, file] of sourceFiles) {
    const destination = resolve(root, ...name.split('/'));
    const containment = relative(root, destination);
    if (containment.startsWith('..') || isAbsolute(containment)) throw new Error(`source path escaped mirror target: ${name}`);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(file, destination);
  }
  const removeEmpty = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) removeEmpty(join(dir, entry.name));
    if (dir !== root && readdirSync(dir).length === 0) rmdirSync(dir);
  };
  removeEmpty(root);
}

function sync(target, dryRun = false) {
  if (basename(target) !== 'long-novel-writer') throw new Error(`target basename must be long-novel-writer: ${target}`);
  const parent = dirname(target);
  const staging = join(parent, `.long-novel-writer.staging.${process.pid}.${Date.now()}`);
  const backup = join(parent, `.long-novel-writer.backup.${new Date().toISOString().replace(/[:.]/g, '-')}`);
  assertEphemeral(staging, parent, '.long-novel-writer.staging.');
  assertEphemeral(backup, parent, '.long-novel-writer.backup.');
  const sourceHash = treeHash(source);
  if (dryRun) return { target, dryRun: true, source: sourceHash, wouldBackup: existsSync(target) };
  mkdirSync(parent, { recursive: true });
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  cpSync(source, staging, { recursive: true, errorOnExist: true });
  const stagedHash = treeHash(staging);
  if (sourceHash.sha256 !== stagedHash.sha256) throw new Error(`staging hash mismatch: ${target}`);
  let backedUp = false;
  let mode = 'replace-directory';
  try {
    if (existsSync(target)) {
      try { renameSync(target, backup); backedUp = true; }
      catch (error) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
        cpSync(target, backup, { recursive: true, errorOnExist: true });
        backedUp = true;
        mode = 'mirror-in-place';
      }
    }
    if (mode === 'replace-directory') renameSync(staging, target);
    else { mirrorInPlace(staging, target); rmSync(staging, { recursive: true, force: true }); }
    const installedHash = treeHash(target);
    if (sourceHash.sha256 !== installedHash.sha256) throw new Error(`installed hash mismatch: ${target}`);
    return { target, mode, source: sourceHash, installed: installedHash, backup: backedUp ? backup : null };
  } catch (error) {
    if (backedUp && existsSync(backup)) {
      if (mode === 'mirror-in-place') mirrorInPlace(backup, target);
      else if (existsSync(target)) {
        if (resolve(dirname(target)) !== resolve(parent) || basename(target) !== 'long-novel-writer') throw new Error(`unsafe rollback target: ${target}`, { cause: error });
        rmSync(target, { recursive: true, force: true });
        renameSync(backup, target);
      }
      else renameSync(backup, target);
    }
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || '')) {
  try {
    const dryRun = process.argv.includes('--dry-run');
    const results = targetsOf(process.argv.slice(2)).map((target) => sync(target, dryRun));
    process.stdout.write(`${JSON.stringify({ ok: true, source, results }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code || 'INSTALL_FAILED', message: error.message } }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

export { walk, treeHash, targetsOf, assertEphemeral, mirrorInPlace, sync };
