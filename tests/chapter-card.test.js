'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const card = require('../skill/long-novel-writer/scripts/chapter-card');
const { build: contextBuild } = require('../skill/long-novel-writer/scripts/context-pack');
const { audit } = require('../skill/long-novel-writer/scripts/project-audit');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-card-'));
  const init = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'chapter-card'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const project = JSON.parse(init.stdout).project;
  fs.appendFileSync(path.join(project, 'outline', 'chapter-beats.md'), '| 1 | Lin | get the receipt | collector blocks the door | receipt names a witness | loses the safe route | witness is inside | pressure becomes resolve | the lock clicks twice |\n', 'utf8');
  fs.writeFileSync(path.join(project, 'state', 'character-state.md'), '| Character | Place | Known information |\n|---|---|---|\n| Lin | shop | knows the receipt is hidden |\n', 'utf8');
  fs.writeFileSync(path.join(project, 'state', 'foreshadowing-index.json'), JSON.stringify({ due: [{ id: 'F-01', kind: 'setup', chapter: 1, content: 'the receipt' }] }, null, 2), 'utf8');
  return project;
}

test('chapter card binds a beat, knowledge boundary, due foreshadowing, and scene delivery', () => {
  const project = projectOf();
  const result = card.write(project, { chapter: '1' });
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  assert.equal(result.card.status, 'ready');
  assert.equal(result.card.chapter_beat.goal, 'get the receipt');
  assert.equal(result.card.character_knowledge_boundary.known_information, 'knows the receipt is hidden');
  assert.deepEqual(result.card.foreshadowing_due, [{ id: 'F-01', kind: 'setup', content: 'the receipt', deadline: null }]);
  assert.equal(result.card.scene_contract.length, 3);
  assert.ok(fs.existsSync(result.output));
  assert.equal(card.validate(project, { chapter: '1' }).ok, true);
  const pack = contextBuild(project, { chapter: '1', budget: '12000' });
  assert.ok(pack.manifest.sources.some((item) => item.path === 'state/chapter-cards/ch-0001.json' && item.tier === 'critical'));
  assert.ok(audit(project).artifacts.some((item) => item.path === 'state/chapter-cards/ch-0001.json'));
});

test('chapter card keeps drafting closed when a required beat is absent', () => {
  const project = projectOf();
  const result = card.build(project, { chapter: '2' });
  assert.equal(result.card.status, 'blocked');
  assert.ok(result.errors.some((item) => item.code === 'CHAPTER_CARD_BEAT_MISSING'));
});
