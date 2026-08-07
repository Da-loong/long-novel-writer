#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith('--')) args[value.slice(2)] = argv[++index];
    else if (!args.project) args.project = value;
  }
  return args;
}

function readText(project, relative, fallback = '（缺失）') {
  const file = path.join(project, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim() : fallback;
}

function readJson(project, relative, fallback = {}) {
  const file = path.join(project, relative);
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new CliError('JSON_INVALID', `无法读取 ${relative}`, { relative, message: error.message }); }
}

function chapterNumber(name) { return Number.parseInt(path.basename(name).match(/^ch-(\d{4})-/i)?.[1] || '0', 10); }

function latestChapter(project) {
  const dir = path.join(project, 'manuscript');
  if (!fs.existsSync(dir)) return null;
  const names = fs.readdirSync(dir).filter((name) => /^ch-\d{4}-.+\.md$/i.test(name)).sort((a, b) => chapterNumber(a) - chapterNumber(b));
  return names.at(-1) || null;
}

function build(projectInput, options = {}) {
  const project = path.resolve(projectInput);
  if (!fs.existsSync(path.join(project, 'state', 'project-state.json'))) throw new CliError('STATE_MISSING', '缺少 state/project-state.json', { project });
  const projectState = readJson(project, 'state/project-state.json');
  const transaction = readJson(project, 'state/chapter-transaction.json', { phase: 'idle' });
  const pilot = readJson(project, 'state/pilot-verdict.json', { status: 'pending', reviewed_through: 0 });
  const autopilot = readJson(project, 'state/autopilot.json', { mode: 'supervised', status: 'idle', phase: 'idle' });
  const autopilotPilot = readJson(project, 'state/autopilot-pilot.json', { status: 'pending', reviewed_through: 0, auto_confirmed: false });
  const latest = latestChapter(project);
  const updatedThrough = Number(projectState.updated_through || 0);
  const nextChapter = Number.parseInt(options['next-chapter'] || String(updatedThrough + 1), 10);
  if (!Number.isInteger(nextChapter) || nextChapter <= 0) throw new CliError('INVALID_CHAPTER', 'next-chapter 必须是正整数', { nextChapter });
  const releaseToScale = (pilot.status === 'approved' && Number(pilot.reviewed_through || 0) >= 3 && pilot.human_confirmed === true)
    || (autopilot.mode === 'autopilot' && autopilotPilot.status === 'approved' && autopilotPilot.auto_confirmed === true && Number(autopilotPilot.score || 0) >= 8 && Number(autopilotPilot.reviewed_through || 0) >= 3);
  const nextAction = transaction.phase === 'drafting'
    ? `先完成或中止 state/chapter-transaction.json 中的第 ${transaction.chapter || '?'} 章事务`
    : nextChapter === 4 && Number(projectState.target_words || 0) >= 300000 && !releaseToScale
      ? '先完成黄金三章真人冷读并写入 pilot-review verdict，再开始第4章'
      : `运行 chapter-transaction.js begin --chapter ${nextChapter}，生成上下文包后再写正文`;
  const feedback = readText(project, 'state/feedback-ledger.md', '（暂无已沉淀反馈）');
  const markdown = `# 当前会话交接\n\n- 生成时间：${new Date().toISOString()}\n- 项目：${projectState.title || path.basename(project)}\n- 题材：${projectState.genre || '未指定'}\n- 目标字数：${projectState.target_words || '未指定'}\n- 已落盘至：第 ${updatedThrough} 章\n- 下一章：第 ${nextChapter} 章\n- 最近正文：${latest ? `manuscript/${latest}` : '暂无'}\n- 运行模式：${autopilot.mode}\n- 自动阶段：${autopilot.phase}\n- 规模化放行：${releaseToScale ? '已放行' : '未放行'}\n\n## 下一动作\n\n${nextAction}\n\n## 当前事实源\n\n### current-state.md\n\n${readText(project, 'state/current-state.md')}\n\n### character-state.md\n\n${readText(project, 'state/character-state.md')}\n\n### unresolved-hooks.md\n\n${readText(project, 'state/unresolved-hooks.md')}\n\n## 最近反馈（只读；修复后追加新条目）\n\n${feedback}\n\n## 事务、人工试读与自动盲评\n\n\`chapter-transaction.json\`：\n\n\`\`\`json\n${JSON.stringify(transaction, null, 2)}\n\`\`\`\n\n\`pilot-verdict.json\`：\n\n\`\`\`json\n${JSON.stringify(pilot, null, 2)}\n\`\`\`\n\n\`autopilot.json\`：\n\n\`\`\`json\n${JSON.stringify(autopilot, null, 2)}\n\`\`\`\n\n\`autopilot-pilot.json\`：\n\n\`\`\`json\n${JSON.stringify(autopilotPilot, null, 2)}\n\`\`\`\n`;
  return { ok: true, project, output: path.join(project, 'state', 'handoff-current.md'), next_chapter: nextChapter, latest_chapter: latest, release_to_scale: releaseToScale, markdown };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.project) throw new CliError('USAGE', '用法: node handoff.js <项目目录> [--next-chapter N]');
  const result = build(args.project, args);
  atomicWrite(result.output, result.markdown);
  const { markdown, ...report } = result;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return result;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'handoff'); }
}

module.exports = { argsOf, chapterNumber, latestChapter, build, run };
