'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts', 'rank-scan.js');

test('rank scan supports offline evidence and atomic output', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-rank-'));
  const output = path.join(temp, 'snapshot.json');
  const result = spawnSync(process.execPath, [script, '--platform', 'qimao', '--input', path.join(__dirname, 'fixtures', 'ranking.pipe'), '--out', output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const snapshot = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(snapshot.sample_size, 2);
  assert.equal(snapshot.items[0].title, '春灯录');
});

test('Firecrawl dry run exposes request without consuming credits', () => {
  const result = spawnSync(process.execPath, [script, '--platform', 'fanqie', '--dry-run'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dryRun, true);
  assert.match(report.request.url, /fanqienovel\.com/);
  assert.equal(report.request.formats[0].type, 'json');
});

test('Firecrawl self-host response becomes a normalized snapshot', async (t) => {
  const server = http.createServer((request, response) => {
    assert.equal(request.url, '/v2/scrape');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ success: true, data: { json: { books: [{ rank: 1, title: '潮汐之城', author: '测试作者' }] } } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const port = server.address().port;
  const child = spawn(process.execPath, [script, '--platform', 'qimao'], {
    env: { ...process.env, FIRECRAWL_API_URL: `http://127.0.0.1:${port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 0, stderr);
  const snapshot = JSON.parse(stdout);
  assert.equal(snapshot.items[0].title, '潮汐之城');
  assert.match(snapshot.items[0].source, /Firecrawl/);
});
