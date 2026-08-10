#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError } = require('./cap-utils');

function argsOf(argv) {
  const out = { dry_run: false };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--dry-run') out.dry_run = true;
    else if (value.startsWith('--')) out[value.slice(2)] = argv[++i];
    else if (!out.project) out.project = value;
  }
  return out;
}

const ROOTS = ['analysis', 'evidence', 'state'];
const TEMP_FILE = /^(?:_tmp|_x|_c|tmp[-_.]|x[-_.]|c[-_.])|_bookpage_probe\.html$/i;

function collect(project) {
  const files = [];
  for (const root of ROOTS) {
    const base = path.join(project, root);
    if (!fs.existsSync(base)) continue;
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name);
        const stat = fs.lstatSync(file);
        if (stat.isDirectory()) walk(file);
        else if (TEMP_FILE.test(name)) files.push(file);
      }
    };
    walk(base);
  }
  return files;
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project) throw new CliError('USAGE', 'Usage: node cleanup-temp.js <PROJECT> [--dry-run]');
  const project = path.resolve(args.project);
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project });
  const files = collect(project);
  if (!args.dry_run) for (const file of files) fs.unlinkSync(file);
  const report = { ok: true, command: 'cleanup-temp', project, dry_run: args.dry_run, removed: files.map((file) => path.relative(project, file).replace(/\\/g, '/')) };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'cleanup-temp'); }
}

module.exports = { TEMP_FILE, collect, argsOf, run };
