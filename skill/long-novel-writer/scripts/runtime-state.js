#!/usr/bin/env node
'use strict';
/* Primary orchestration envelope; legacy files are compatibility projections. */
const fs = require('fs'); const path = require('path'); const { CliError, emitError, atomicWrite } = require('./cap-utils');
const OUTPUT = 'state/production-runtime.json';
function projectOf(input) { const project = path.resolve(input || ''); if (!input || !fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', 'Missing state/project-state.json', { project }); return project; }
function readJson(file, fallback = null) { if (!fs.existsSync(file)) return fallback; try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (_) { return fallback; } }
function read(projectInput) { const project = projectOf(projectInput); return readJson(path.join(project, OUTPUT), { schema_version: '1.0', status: 'idle', phase: 'idle', runner: null, workflow: null, pilot: null, updated_at: null }); }
function sync(projectInput, runner = undefined) { const project = projectOf(projectInput); const prior = read(project); const next = { ...prior, schema_version: '1.0', runner: runner === undefined ? readJson(path.join(project, 'state', 'autopilot-run.json'), prior.runner) : runner, workflow: readJson(path.join(project, 'state', 'workflow-run.json'), prior.workflow), pilot: readJson(path.join(project, 'state', 'autopilot-pilot.json'), prior.pilot), status: runner?.status || prior.runner?.status || prior.status, phase: runner?.phase || prior.runner?.phase || prior.phase, updated_at: new Date().toISOString(), rule: 'Primary orchestration envelope. autopilot-run.json, workflow-run.json, and autopilot-pilot.json are compatibility projections.' }; atomicWrite(path.join(project, OUTPUT), `${JSON.stringify(next, null, 2)}\n`); return next; }
function run(argv = process.argv.slice(2)) { const [command, project] = argv; if (command !== 'sync' || !project) throw new CliError('USAGE', 'Usage: node runtime-state.js sync <PROJECT>'); const report = sync(project); process.stdout.write(`${JSON.stringify({ ok: true, project: path.resolve(project), output: OUTPUT, status: report.status, phase: report.phase }, null, 2)}\n`); return report; }
if (require.main === module) { try { run(); } catch (error) { process.exitCode = emitError(error, 'runtime-state'); } }
module.exports = { OUTPUT, read, sync, run };
