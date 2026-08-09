'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const chapterFacts = require('../skill/long-novel-writer/scripts/chapter-facts');
const { build: contextBuild } = require('../skill/long-novel-writer/scripts/context-pack');
const { audit } = require('../skill/long-novel-writer/scripts/project-audit');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-facts-'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'chapter-facts'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const project = JSON.parse(result.stdout).project;
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0001-雨夜.md'), '# 雨夜\n\n林越把欠条按在柜台上。\n\n巷口的人堵住了退路。\n', 'utf8');
  return project;
}

function report(overrides = {}) {
  return {
    schema_version: '1.0', chapter: 1, extractor_id: 'fact-fixture', summary: 'Lin commits publicly and loses the easy exit.',
    facts: [
      { kind: 'event', subject: 'Lin', claim: 'Publicly presents the debt note.', evidence: '林越把欠条按在柜台上。' },
      { kind: 'hook_open', subject: 'Lin', claim: 'The exit is blocked by the crowd.', evidence: '巷口的人堵住了退路。' },
    ],
    ...overrides,
  };
}

test('chapter facts archive literal fact deltas and enter later context', () => {
  const project = projectOf();
  const relative = 'analysis/chapter-facts-ch0001.json';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report(), null, 2), 'utf8');
  const result = chapterFacts.validate(project, { chapter: '1', file: relative });
  assert.equal(result.ok, true);
  assert.equal(result.data.facts.length, 2);
  assert.equal(result.ledger, 'state/fact-ledger/ch-0001.json');
  assert.ok(audit(project).artifacts.some((item) => item.path === result.ledger));
  const context = contextBuild(project, { chapter: '2', budget: '12000' });
  assert.ok(context.manifest.sources.some((item) => item.path === result.ledger && item.representation === 'chapter-facts'));
});

test('chapter facts reject fabricated manuscript evidence', () => {
  const project = projectOf();
  const relative = 'analysis/chapter-facts-ch0001.json';
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report({
    facts: [{ kind: 'event', subject: 'Lin', claim: 'Claims an unseen victory.', evidence: '这句话不在正文里。' }],
  }), null, 2), 'utf8');
  assert.throws(() => chapterFacts.validate(project, { chapter: '1', file: relative }), (error) => error.code === 'CHAPTER_FACTS_INVALID');
});
