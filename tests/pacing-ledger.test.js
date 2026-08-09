'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const pacing = require('../skill/long-novel-writer/scripts/pacing-ledger');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-pacing-'));
  const result = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'pacing-ledger'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).project;
}

function writeAcceptedReview(project, chapter, rhythm, round = 1) {
  const manuscriptRelative = `manuscript/ch-${String(chapter).padStart(4, '0')}-节奏测试.md`;
  const manuscript = `# 第${chapter}章\n\n林越把第${chapter}张欠条拍在柜台上。\n\n门口的人让出一条路。\n`;
  fs.writeFileSync(path.join(project, manuscriptRelative), manuscript, 'utf8');
  const report = {
    schema_version: '1.0', chapter, reviewer_id: 'pacing-fixture', verdict: 'pass', should_revise: false,
    manuscript_sha256: pacing.sha256(manuscript), rhythm,
    scores: { continuation: 8, payoff: 8, fanqie_fit: 8 },
  };
  const relative = `analysis/chapter-reader-review-ch${String(chapter).padStart(4, '0')}-r${String(round).padStart(2, '0')}.json`;
  fs.writeFileSync(path.join(project, relative), JSON.stringify(report, null, 2), 'utf8');
  return { manuscript, relative };
}

test('pacing ledger uses the accepted review and warns on repeated serial shapes', () => {
  const project = projectOf();
  for (let chapter = 1; chapter <= 5; chapter++) {
    const created = writeAcceptedReview(project, chapter, { pressure: 'high', hook_type: 'risk', payoff_type: 'resource' });
    if (chapter === 1) {
      fs.writeFileSync(path.join(project, 'analysis', 'chapter-reader-review-ch0001-r02.json'), JSON.stringify({
        schema_version: '1.0', chapter, reviewer_id: 'stale-fixture', verdict: 'pass', should_revise: false,
        manuscript_sha256: 'stale', rhythm: { pressure: 'release', hook_type: 'reveal', payoff_type: 'answer' }, scores: { continuation: 9, payoff: 9, fanqie_fit: 9 },
      }, null, 2), 'utf8');
    }
    const result = pacing.update(project, { chapter: String(chapter) });
    assert.equal(result.ok, true);
    if (chapter === 1) assert.equal(result.entry.review, created.relative);
  }
  const result = pacing.inspect(project);
  assert.equal(result.updated_through, 5);
  assert.deepEqual(result.audit.window.map((item) => item.hook_type), ['risk', 'risk', 'risk', 'risk', 'risk']);
  assert.ok(result.audit.warnings.some((item) => item.code === 'HOOK_TYPE_STREAK'));
  assert.ok(result.audit.warnings.some((item) => item.code === 'PAYOFF_TYPE_STREAK'));
  assert.ok(result.audit.warnings.some((item) => item.code === 'PRESSURE_OVERLOAD'));
  assert.ok(result.audit.warnings.some((item) => item.code === 'RELEASE_GAP'));
});

test('pacing ledger skips a chapter whose final reader review is absent', () => {
  const project = projectOf();
  fs.writeFileSync(path.join(project, 'manuscript', 'ch-0001-无审稿.md'), '# 无审稿\n\n正文。\n', 'utf8');
  const result = pacing.update(project, { chapter: '1' });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});
