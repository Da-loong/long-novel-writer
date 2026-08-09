'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dna = require('../skill/long-novel-writer/scripts/book-dna');

const scripts = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-dna-'));
  const init = spawnSync(process.execPath, [path.join(scripts, 'init-project.js'), '--root', root, '--title', 'book-dna'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  return JSON.parse(init.stdout).project;
}

test('Book DNA compiles only adopted mechanisms with multi-title provenance', () => {
  const project = projectOf();
  const matrix = path.join(project, 'evidence', 'derivations', 'benchmark-feature-matrix.md');
  fs.appendFileSync(matrix, '| DNA-OPEN | chapter | Open on a visible pressure, then give a concrete mini-payoff before the end pull. | Observed in the opening samples. | B01,B02,B03 | opening | adopted |\n', 'utf8');
  fs.appendFileSync(matrix, '| DNA-ONE | prose | Copy one writer exactly. | Not allowed. | B01 | all | adopted |\n', 'utf8');
  const result = dna.compile(project);
  assert.equal(result.mechanism_count, 1);
  assert.equal(result.data.mechanisms[0].id, 'DNA-OPEN');
  assert.ok(result.warnings.some((item) => item.code === 'BOOK_DNA_MULTI_SOURCE_REQUIRED' && item.id === 'DNA-ONE'));
  assert.equal(dna.due(project, 1).length, 1);
  assert.equal(dna.due(project, 4).length, 0);
});

test('Book DNA preserves legacy projects without benchmark source files', () => {
  const project = projectOf();
  fs.unlinkSync(path.join(project, 'evidence', 'derivations', 'benchmark-feature-matrix.md'));
  fs.unlinkSync(path.join(project, 'evidence', 'derivations', 'source-boundaries.md'));
  const result = dna.compile(project);
  assert.equal(result.mechanism_count, 0);
  assert.equal(result.warnings[0].code, 'BOOK_DNA_NOT_CONFIGURED');
});
