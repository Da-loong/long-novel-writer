'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const agenda = require('../skill/long-novel-writer/scripts/hook-agenda');
const contextPack = require('../skill/long-novel-writer/scripts/context-pack');

function fixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-hook-agenda-'));
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts', 'init-project.js'),
    '--root', root, '--title', 'hook-agenda-test', '--target-words', '1000000', '--genre', 'urban',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).project;
}

function entry(id, setup, lastOpened, deadline, status = 'active') {
  return {
    id,
    plan: { setup_chapter: setup, content: `${id} promise`, reinforcement_chapters: [], payoff_deadline_chapter: deadline, status: 'open' },
    observed: {
      opened: [{ chapter: lastOpened, file: `state/fact-ledger/ch-${String(lastOpened).padStart(4, '0')}.json`, evidence: `${id} appears` }],
      closed: [],
    },
    status,
  };
}

test('hook agenda turns stale observed promises into bounded next-chapter debt', () => {
  const project = fixtureProject();
  const progress = {
    schema_version: '1.0', updated_through: 10,
    entries: [
      entry('F-OLD', 1, 1, 20),
      entry('F-RECENT', 2, 10, 12),
      { ...entry('F-DONE', 1, 2, 6, 'resolved'), observed: { opened: [{ chapter: 2 }], closed: [{ chapter: 4 }] } },
    ],
  };
  fs.writeFileSync(path.join(project, agenda.SOURCE), `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
  const result = agenda.write(project, { chapter: '11', 'stale-after': '5', 'max-must-advance': '1' });

  assert.equal(result.ok, true);
  assert.equal(result.data.target_chapter, 11);
  assert.deepEqual(result.data.active_hooks.map((item) => item.id), ['F-OLD', 'F-RECENT']);
  assert.deepEqual(result.data.must_advance.map((item) => item.id), ['F-OLD']);
  assert.deepEqual(result.data.stale_debt.map((item) => item.id), ['F-OLD']);
  assert.ok(result.warnings.some((item) => item.code === 'STALE_HOOK_DEBT'));
  assert.ok(result.recommendations.some((item) => item.includes('F-OLD')));
  assert.ok(fs.existsSync(path.join(project, agenda.OUTPUT)));

  const pack = contextPack.build(project, { chapter: '11', query: 'promise', budget: '30000' });
  assert.ok(pack.manifest.sources.some((source) => source.path === agenda.OUTPUT && source.tier === 'critical'));
});
