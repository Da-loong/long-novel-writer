#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError } = require('./cap-utils');

const REQUIRED_PROJECT_FILES = [
  'evidence/sources/writer-classroom-index.md',
  'settings/platform-classroom-map.md',
];

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index].startsWith('--')) args[argv[index].slice(2)] = argv[++index] ?? true;
    else if (!args.project) args.project = argv[index];
  }
  return args;
}

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') : '';
}

function audit(projectInput) {
  if (!projectInput) throw new CliError('USAGE', 'Usage: node classroom-audit.js <project>');
  const project = path.resolve(projectInput);
  if (!fs.existsSync(project)) throw new CliError('PATH_NOT_FOUND', `Project directory not found: ${project}`, { project });
  const missing = REQUIRED_PROJECT_FILES.filter((relative) => !fs.existsSync(path.join(project, relative)));
  const source = read(path.join(project, 'evidence/sources/writer-classroom-index.md'));
  const map = read(path.join(project, 'settings/platform-classroom-map.md'));
  const categoryAliases = [
    ['平台宝典', 'Platform handbook'],
    ['新手专区', 'Beginner zone'],
    ['大神专访', 'Author interviews'],
    ['写作技巧', 'Writing craft'],
    ['品类指南', 'Genre guides'],
  ];
  const categories = categoryAliases.filter((aliases) => aliases.some((name) => source.includes(name))).map((aliases) => aliases[0]);
  const playbook = path.resolve(__dirname, '..', 'references', 'platform', 'fanqie-writer-classroom-playbook.md');
  const report = {
    schema_version: '1.0',
    project,
    playbook_exists: fs.existsSync(playbook),
    missing_project_files: missing,
    official_categories_found: categories,
    pending_adoptions: (map.match(/待填写|待重做|未完成|queued|redo required/g) || []).length,
    ready_for_classroom_release: fs.existsSync(playbook) && missing.length === 0 && categories.length === 5 && !/待填写|待重做|未完成|redo required/.test(map),
  };
  return report;
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  const report = audit(args.project);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'classroom-audit'); }
}

module.exports = { REQUIRED_PROJECT_FILES, argsOf, audit, run };
