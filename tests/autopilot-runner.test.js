'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const runner = require('../skill/long-novel-writer/scripts/autopilot-runner');
const { audit } = require('../skill/long-novel-writer/scripts/project-audit');
const chapterReaderReview = require('../skill/long-novel-writer/scripts/chapter-reader-review');

function projectOf() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lnw-autopilot-'));
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'skill', 'long-novel-writer', 'scripts', 'init-project.js'),
    '--root', root, '--title', 'runner-test', '--target-words', '1000000', '--genre', '都市',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).project;
}

function sceneEvidence(chapter) {
  return {
    goal: { status: 'present', evidence: `林越把第${chapter}张欠条拍在柜台上。`, note: 'The immediate objective is visible.' },
    obstacle: { status: 'present', evidence: '“今天给答案。”', note: 'The demanded answer creates pressure.' },
    turn: { status: 'present', evidence: '选择1落下，林越抓起旧秤走向亮着灯的巷口', note: 'The protagonist commits to a changed course.' },
    payoff: { status: 'present', evidence: '围观的人让开一条窄路', note: 'The choice yields a concrete change in access.' },
    hook: { status: 'present', evidence: '这一步把下一次选择的代价摆到了所有人面前。', note: 'The next cost is unresolved.' },
  };
}

function contractReviewFields(request, chapter) {
  const manuscript = fs.readdirSync(path.join(request.project, 'manuscript')).find((name) => new RegExp(`^ch-${String(chapter).padStart(4, '0')}-`).test(name));
  const body = fs.readFileSync(path.join(request.project, 'manuscript', manuscript), 'utf8');
  const evidence = `林越把第${chapter}张欠条拍在柜台上。`;
  const style = JSON.parse(fs.readFileSync(path.join(request.project, 'state', 'style-contract.json'), 'utf8')).signals || [];
  const characters = JSON.parse(fs.readFileSync(path.join(request.project, 'state', 'character-contracts.json'), 'utf8')).characters || [];
  return {
    schema_version: '1.4',
    style_signal_checks: style.map((signal) => ({ id: signal.id, verdict: 'pass', evidence, note: 'The chapter opens with a concrete action before exposition.' })),
    character_contract_checks: characters.filter((character) => body.includes(character.name)).map((character) => ({ id: character.id, verdict: 'pass', evidence, note: 'The lead acts toward the debt problem under immediate pressure without claiming hidden knowledge.' })),
    editorial_dimension_checks: chapterReaderReview.EDITORIAL_DIMENSIONS.map((dimension) => ({ id: dimension.id, verdict: 'pass', evidence, note: `The prose supplies literal scene evidence for ${dimension.id}.` })),
  };
}

function fakeAgent(request) {
  const write = (relative, content) => {
    const file = path.join(request.project, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  };
  if (request.task === 'build') {
    write('settings/story-bible.md', '# Story bible\n\n## Premise\nA street vendor sees the cost of every promise.\n');
    write('settings/reader-contract.md', '# Reader contract\n\n## Promise\nFast choices, visible costs, and a cliffhanger every chapter.\n');
    write('settings/platform-contract.md', '# Platform contract\n\n## Fit\nMobile-first pacing with a clear first-screen conflict.\n');
  } else if (request.task === 'character') {
    write('settings/characters.md', '# Characters\n\n## Lead\nLin chooses action over safety.\n');
    write('settings/relations.md', '# Relations\n\n| A | B | pressure |\n|---|---|---|\n| Lin | debt collector | rising |\n');
    write('evidence/derivations/character-contracts.md', '# Character contracts\n\n| Name | Goal | Pressure/motivation | Knowledge boundary | Voice/action | Forbidden | Scope | Status |\n|---|---|---|---|---|---|---|---|\n| 林越 | 解决欠条危机 | 对方逼索答案 | 只知道眼前欠条的风险 | 短句先行动 | 不预知对手背景 | opening | adopted |\n');
  } else if (request.task === 'story-plan') {
    write('outline/master-outline.md', '# Master outline\n\n## Arc\nA debt turns into a public choice and a larger mystery.\n');
    write('settings/style-guide.md', '# Style guide\n\n## Voice\nConcrete action, short paragraphs, purposeful dialogue.\n');
    write('evidence/derivations/style-signals.md', '# Style signals\n\n| ID | Dimension | Reusable signal | Evidence | Scope | Status |\n|---|---|---|---|---|---|\n| STYLE-OPEN | narrative | Open with concrete action before background explanation. | analysis/breakdown.md#opening | opening | adopted |\n');
  } else if (request.task === 'outline') {
    const rows = [1, 2, 3].map((n) => `| ${n} | Lin | open a new problem | a visible obstacle | a hard choice | a cost | one new fact | pressure rises | a changed question |`).join('\n');
    write('outline/chapter-beats.md', `# Chapter beats\n\n| No | POV | Goal | Obstacle | Turn | Cost | Information | Emotion | Hook |\n|---:|---|---|---|---|---|---|---|---|\n${rows}\n`);
    write('outline/foreshadowing-ledger.md', '# Foreshadowing\n\n| ID | First | Content | Strength | Payoff | Status |\n|---|---:|---|---:|---:|---|\n| F1 | 1 | the receipt | 1 | 3 | open |\n');
  } else if (request.task === 'mvp') {
    const chapter = Number(JSON.parse(fs.readFileSync(path.join(request.project, 'state', 'chapter-transaction.json'), 'utf8')).chapter);
    const body = Array.from({ length: 20 }, (_, index) => `段落${index + 1}的雨声砸过铁棚，林越把第${chapter}张欠条拍在柜台上。回应${index + 1}传来时，巷口的灯映出他手背上的水。\n“今天给答案。”对方${index + 1}说。\n选择${index + 1}落下，林越抓起旧秤走向亮着灯的巷口，围观的人让开一条窄路；这一步把下一次选择的代价摆到了所有人面前。`).join('\n\n');
    write(`manuscript/ch-${String(chapter).padStart(4, '0')}-雨夜的欠条.md`, `# 雨夜的欠条\n\n${body}\n`);
  } else if (request.task === 'mvp-reader-review') {
    const chapter = Number(JSON.parse(fs.readFileSync(path.join(request.project, 'state', 'chapter-transaction.json'), 'utf8')).chapter);
    const output = request.prompt.match(/analysis\/chapter-reader-review-ch\d{4}-r\d{2}\.json/)?.[0];
    assert.ok(output, request.prompt);
    write(output, JSON.stringify({
      ...contractReviewFields(request, chapter), chapter, reviewer_id: 'fixture-cold-reader', verdict: 'pass',
      scores: { clarity: 8, continuation: 8, fanqie_fit: 8, character_agency: 8, payoff: 8 },
      scene_evidence: sceneEvidence(chapter),
      rhythm: { pressure: 'rising', hook_type: 'choice', payoff_type: 'progress' },
      issues: [], summary: 'The chapter has a clear pressure change and a next-reading question.',
    }, null, 2));
  } else if (request.task === 'mvp-fact-extract') {
    const chapter = Number(JSON.parse(fs.readFileSync(path.join(request.project, 'state', 'chapter-transaction.json'), 'utf8')).chapter);
    const output = request.prompt.match(/analysis\/chapter-facts-ch\d{4}\.json/)?.[0];
    assert.ok(output, request.prompt);
    write(output, JSON.stringify({
      schema_version: '1.0', chapter, extractor_id: 'fixture-fact-extractor', summary: 'Lin makes a public choice and gains a route through the crowd.',
      facts: [{ kind: 'event', subject: 'Lin', claim: 'Publicly commits to the debt choice.', evidence: `林越把第${chapter}张欠条拍在柜台上。` }],
    }, null, 2));
  } else if (request.task === 'polish') {
    write('analysis/qa-report.md', '# QA\n\n- chapter gate passed\n');
    write('analysis/reader-metrics.json', JSON.stringify({ schema_version: '1.0', status: 'passed' }));
  }
  return { exitCode: 0, stdout: JSON.stringify({ ok: true, task: request.task }), stderr: '' };
}

test('autopilot runner executes preparation and one durable chapter slice', () => {
  const project = projectOf();
  const started = runner.start(project, { 'max-attempts': '2' });
  assert.equal(started.run.status, 'running');
  const report = runner.runProject(project, { 'max-chapters': '1', invokeAgent: fakeAgent });
  assert.equal(report.ok, true);
  assert.equal(report.current_chapter, 1);
  assert.equal(report.status, 'paused');
  const state = JSON.parse(fs.readFileSync(path.join(project, 'state', 'project-state.json'), 'utf8'));
  assert.equal(state.updated_through, 1);
  assert.ok(state.word_count >= 1200);
  const pacing = JSON.parse(fs.readFileSync(path.join(project, 'state', 'pacing-ledger.json'), 'utf8'));
  assert.equal(pacing.entries.length, 1);
  assert.deepEqual(pacing.entries[0].rhythm, { pressure: 'rising', hook_type: 'choice', payoff_type: 'progress' });
  const facts = JSON.parse(fs.readFileSync(path.join(project, 'state', 'fact-ledger', 'ch-0001.json'), 'utf8'));
  assert.equal(facts.facts.length, 1);
  assert.equal(facts.facts[0].kind, 'event');
  const progress = JSON.parse(fs.readFileSync(path.join(project, 'state', 'foreshadowing-progress.json'), 'utf8'));
  assert.equal(progress.updated_through, 1);
  assert.equal(progress.audit.planned, 1);
  const run = JSON.parse(fs.readFileSync(path.join(project, 'state', 'autopilot-run.json'), 'utf8'));
  assert.deepEqual(run.completed_prepare_nodes, ['build', 'character', 'story-plan', 'outline']);
  assert.ok(fs.existsSync(path.join(project, 'state', 'agent-runs')));
  assert.ok(JSON.parse(fs.readFileSync(path.join(project, 'state', 'workflow-run.json'), 'utf8')).status === 'done');
  assert.ok(fs.existsSync(path.join(project, 'state', 'chapter-memory', 'ch-0001.json')));
});

test('autopilot runner preserves an explicit rejection boundary', () => {
  const project = projectOf();
  const pilotFile = path.join(project, 'state', 'pilot-verdict.json');
  fs.writeFileSync(pilotFile, JSON.stringify({ status: 'rejected', reviewed_through: 3 }), 'utf8');
  assert.throws(() => runner.start(project), (error) => error.code === 'HUMAN_REJECTION_ACTIVE');
  assert.equal(runner.status(project).runner.status, 'idle');
});

test('chapter attempt failure is retried without advancing project state', () => {
  const project = projectOf();
  runner.start(project, { 'max-attempts': '2' });
  let failed = false;
  const flaky = (request) => {
    if (request.task === 'mvp' && !failed) {
      failed = true;
      return { exitCode: 1, stdout: '', stderr: 'transient agent exit' };
    }
    return fakeAgent(request);
  };
  const report = runner.runProject(project, { 'max-chapters': '1', invokeAgent: flaky });
  assert.equal(report.ok, true);
  assert.equal(report.current_chapter, 1);
  const events = fs.readFileSync(path.join(project, 'state', 'autopilot-run-ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(events.some((item) => item.type === 'chapter_attempt_failed' && item.attempt === 1));
  assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'state', 'project-state.json'), 'utf8')).updated_through, 1);
});

test('stop writes a resumable reason and status exposes all runtimes', () => {
  const project = projectOf();
  runner.start(project);
  const stopped = runner.stop(project, { code: 'TEST_STOP', reason: 'fixture checkpoint' });
  assert.equal(stopped.status, 'paused');
  const status = runner.status(project);
  assert.equal(status.runner.stop_code, 'TEST_STOP');
  assert.equal(status.autopilot.status, 'paused');
  assert.equal(status.workflow.status, 'running');
});

test('autopilot repairs a failed draft inside the active chapter transaction', () => {
  const project = projectOf();
  runner.start(project, { 'max-attempts': '1', 'chapter-revision-passes': '2' });
  const repairAgent = (request) => {
    if (request.task === 'mvp') {
      const result = fakeAgent(request);
      const chapterFile = fs.readdirSync(path.join(request.project, 'manuscript')).find((name) => /^ch-\d{4}-.+\.md$/i.test(name));
      fs.writeFileSync(path.join(request.project, 'manuscript', chapterFile), [
        '# Broken draft', '', '[TODO]', '',
        '林越把第1张欠条拍在柜台上。', '', '“今天给答案。”', '',
        '选择1落下，林越抓起旧秤走向亮着灯的巷口，围观的人让开一条窄路。', '',
        '这一步把下一次选择的代价摆到了所有人面前。', '',
      ].join('\n'), 'utf8');
      return result;
    }
    if (request.task === 'mvp-structure-revise') return fakeAgent({ ...request, task: 'mvp' });
    return fakeAgent(request);
  };
  const report = runner.runProject(project, { 'max-chapters': '1', invokeAgent: repairAgent });
  assert.equal(report.ok, true, JSON.stringify(report));
  const qa = JSON.parse(fs.readFileSync(path.join(project, 'analysis', 'autopilot-qa-ch0001.json'), 'utf8'));
  assert.equal(qa.revision_passes.length, 1);
  assert.equal(qa.revision_passes[0].task, 'mvp-structure-revise');
  const tasks = fs.readdirSync(path.join(project, 'state', 'agent-runs')).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(fs.readFileSync(path.join(project, 'state', 'agent-runs', name), 'utf8')).task);
  assert.ok(tasks.includes('mvp-structure-revise'));
});

test('cold-reader evidence triggers an in-transaction repair even when deterministic gates pass', () => {
  const project = projectOf();
  runner.start(project, { 'max-attempts': '1', 'chapter-revision-passes': '2' });
  let readerRounds = 0;
  const semanticRepairAgent = (request) => {
    if (request.task === 'mvp-reader-review') {
      readerRounds++;
      const output = request.prompt.match(/analysis\/chapter-reader-review-ch\d{4}-r\d{2}\.json/)?.[0];
      assert.ok(output, request.prompt);
      const chapter = Number(JSON.parse(fs.readFileSync(path.join(request.project, 'state', 'chapter-transaction.json'), 'utf8')).chapter);
      const report = readerRounds === 1
        ? {
          ...contractReviewFields(request, chapter), chapter, reviewer_id: 'fixture-cold-reader', verdict: 'revise',
          scores: { clarity: 6, continuation: 6, fanqie_fit: 6, character_agency: 8, payoff: 6 },
          scene_evidence: sceneEvidence(chapter),
          rhythm: { pressure: 'rising', hook_type: 'choice', payoff_type: 'progress' },
          issues: [{ code: 'FLAT_TENSION', severity: 'warning', evidence: '林越把第1张欠条拍在柜台上。', repair: 'Make the consequence of the choice sharper in the next draft.' }],
          summary: 'The scene is understandable but lacks enough immediate pull.',
        }
        : {
          ...contractReviewFields(request, chapter), chapter, reviewer_id: 'fixture-cold-reader', verdict: 'pass',
          scores: { clarity: 8, continuation: 8, fanqie_fit: 8, character_agency: 8, payoff: 8 }, scene_evidence: sceneEvidence(chapter), rhythm: { pressure: 'rising', hook_type: 'choice', payoff_type: 'progress' }, issues: [], summary: 'Repair addressed the reader concern.',
        };
      const file = path.join(request.project, output);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    if (request.task === 'mvp-structure-revise') return fakeAgent({ ...request, task: 'mvp' });
    return fakeAgent(request);
  };
  const report = runner.runProject(project, { 'max-chapters': '1', invokeAgent: semanticRepairAgent });
  assert.equal(report.ok, true, JSON.stringify(report));
  const qa = JSON.parse(fs.readFileSync(path.join(project, 'analysis', 'autopilot-qa-ch0001.json'), 'utf8'));
  assert.equal(qa.revision_passes.length, 1);
  assert.equal(qa.revision_passes[0].task, 'mvp-structure-revise');
  assert.equal(qa.reader_reviews.length, 2);
  assert.equal(qa.reader_reviews[0].should_revise, true);
  assert.equal(qa.reader_reviews[1].should_revise, false);
  assert.ok(fs.existsSync(path.join(project, 'analysis', 'chapter-reader-review-ch0001-r01.json')));
  assert.ok(fs.existsSync(path.join(project, 'analysis', 'chapter-reader-review-ch0001-r02.json')));
  const brief = fs.readFileSync(path.join(project, 'analysis', 'chapter-revision-brief-ch0001-r01.md'), 'utf8');
  assert.match(brief, /## Preserve/);
  assert.match(brief, /林越把第1张欠条拍在柜台上。/);
  const revision = JSON.parse(fs.readFileSync(path.join(project, 'state', 'chapter-revisions', 'ch-0001-r01.json'), 'utf8'));
  assert.equal(revision.decision.accepted, true);
  assert.equal(revision.decision.reason, 'reader_block_resolved');
  const auditPaths = audit(project).artifacts.map((item) => item.path);
  assert.ok(auditPaths.includes('state/chapter-revisions/ch-0001-r00.md'));
  assert.ok(auditPaths.includes('state/chapter-revisions/ch-0001-r01.json'));
});

test('an editorial-dimension failure triggers a transaction repair even with passing scores', () => {
  const project = projectOf();
  runner.start(project, { 'max-attempts': '1', 'chapter-revision-passes': '2' });
  let readerRounds = 0;
  const editorialRepairAgent = (request) => {
    if (request.task === 'mvp-reader-review') {
      readerRounds++;
      const output = request.prompt.match(/analysis\/chapter-reader-review-ch\d{4}-r\d{2}\.json/)?.[0];
      const chapter = Number(JSON.parse(fs.readFileSync(path.join(request.project, 'state', 'chapter-transaction.json'), 'utf8')).chapter);
      const checks = contractReviewFields(request, chapter).editorial_dimension_checks.map((check) => check.id === 'outline_delivery'
        ? { ...check, verdict: readerRounds === 1 ? 'fail' : 'pass', note: readerRounds === 1 ? 'The decisive movement remains summarized.' : 'The decisive movement is now dramatized.' }
        : check);
      const report = {
        ...contractReviewFields(request, chapter), chapter, reviewer_id: 'editorial-fixture', verdict: readerRounds === 1 ? 'revise' : 'pass',
        editorial_dimension_checks: checks,
        scores: { clarity: 8, continuation: 8, fanqie_fit: 8, character_agency: 8, payoff: 8 },
        scene_evidence: sceneEvidence(chapter), rhythm: { pressure: 'rising', hook_type: 'choice', payoff_type: 'progress' }, issues: [],
        summary: readerRounds === 1 ? 'The chapter needs its planned turn on the page.' : 'The revision delivers the planned turn.',
      };
      const file = path.join(request.project, output);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    if (request.task === 'mvp-structure-revise') return fakeAgent({ ...request, task: 'mvp' });
    return fakeAgent(request);
  };
  const result = runner.runProject(project, { 'max-chapters': '1', invokeAgent: editorialRepairAgent });
  assert.equal(result.ok, true, JSON.stringify(result));
  const qa = JSON.parse(fs.readFileSync(path.join(project, 'analysis', 'autopilot-qa-ch0001.json'), 'utf8'));
  assert.equal(qa.revision_passes.length, 1);
  assert.deepEqual(qa.reader_reviews[0].editorial_dimension_failures, ['outline_delivery']);
  assert.match(fs.readFileSync(path.join(project, 'analysis', 'chapter-revision-brief-ch0001-r01.md'), 'utf8'), /Editorial outline_delivery/);
});

test('unimproved cold-reader repair is discarded and leaves the previous draft as the candidate', () => {
  const project = projectOf();
  runner.start(project, { 'max-attempts': '1', 'chapter-revision-passes': '2' });
  const plateauAgent = (request) => {
    if (request.task === 'mvp-reader-review') {
      const output = request.prompt.match(/analysis\/chapter-reader-review-ch\d{4}-r\d{2}\.json/)?.[0];
      assert.ok(output, request.prompt);
      const chapter = Number(JSON.parse(fs.readFileSync(path.join(request.project, 'state', 'chapter-transaction.json'), 'utf8')).chapter);
      const file = path.join(request.project, output);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({
        ...contractReviewFields(request, chapter), chapter, reviewer_id: 'plateau-reader', verdict: 'revise',
        scores: { clarity: 6, continuation: 6, fanqie_fit: 6, character_agency: 8, payoff: 6 },
        scene_evidence: sceneEvidence(chapter),
        rhythm: { pressure: 'rising', hook_type: 'choice', payoff_type: 'progress' },
        issues: [{ code: 'FLAT_TENSION', severity: 'warning', evidence: '林越把第1张欠条拍在柜台上。', repair: 'Create a sharper consequence.' }],
        summary: 'The candidate remains too generic.',
      }, null, 2), 'utf8');
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    if (request.task === 'mvp-structure-revise') return fakeAgent({ ...request, task: 'mvp' });
    return fakeAgent(request);
  };
  const report = runner.runProject(project, { 'max-chapters': '1', invokeAgent: plateauAgent });
  assert.equal(report.ok, false, JSON.stringify(report));
  assert.equal(report.code, 'CHAPTER_READER_REVIEW_FAILED');
  const initial = fs.readFileSync(path.join(project, 'state', 'chapter-revisions', 'ch-0001-r00.md'), 'utf8');
  assert.match(initial, /# 雨夜的欠条/);
  const rejected = JSON.parse(fs.readFileSync(path.join(project, 'state', 'chapter-revisions', 'ch-0001-r01.json'), 'utf8'));
  assert.equal(rejected.decision.accepted, false);
  assert.equal(rejected.decision.reason, 'score_plateau_or_regression');
});

test('unproven due foreshadowing rolls fact artifacts and progress back before commit', () => {
  const project = projectOf();
  const dueButUnproven = (request) => {
    const result = fakeAgent(request);
    if (request.task === 'outline') {
      fs.writeFileSync(path.join(request.project, 'outline', 'foreshadowing-ledger.md'), [
        '# Foreshadowing', '',
        '| ID | First | Content | Strength | Payoff | Status |',
        '|---|---:|---|---:|---:|---|',
        '| F1 | 1 | the receipt | 1 | 1 | open |',
      ].join('\n'), 'utf8');
    }
    return result;
  };
  runner.start(project, { 'max-attempts': '1' });
  const report = runner.runProject(project, { 'max-chapters': '1', invokeAgent: dueButUnproven });
  assert.equal(report.ok, false, JSON.stringify(report));
  assert.equal(report.code, 'CHAPTER_FORESHADOWING_GATE_FAILED');
  assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'state', 'project-state.json'), 'utf8')).updated_through, 0);
  assert.equal(fs.existsSync(path.join(project, 'analysis', 'chapter-facts-ch0001.json')), false);
  assert.equal(fs.existsSync(path.join(project, 'state', 'fact-ledger', 'ch-0001.json')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'state', 'foreshadowing-progress.json'), 'utf8')).updated_through, 0);
});
