#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliError, emitError, atomicWrite } = require('./cap-utils');

function argsOf(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
  return args;
}

function safeName(value) {
  const cleaned = String(value || '').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\.+$/g, '').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new CliError('INVALID_TITLE', '书名清理后为空', { title: value });
  return cleaned.slice(0, 80);
}

function md(title, fields) {
  return `# ${title}\n\n${fields.map(([key, value]) => `## ${key}\n\n${value}\n`).join('\n')}`;
}

function templates(meta) {
  const pending = '待首次策划填写；未知项须显式标为“未知”，不得伪造。';
  return {
    'settings/story-bible.md': md('故事圣经', [['项目', meta.title], ['题材', meta.genre], ['一句话卖点', pending], ['世界规则', pending], ['边界与禁区', pending]]),
    'settings/characters.md': md('人物表', [['主角', pending], ['主要配角', pending], ['角色弧线', pending]]),
    'settings/relations.md': md('关系台账', [['关系边', '记录：角色A｜角色B｜当前张力｜最近变化｜证据章节。']]),
    'settings/reader-contract.md': md('读者契约', [['目标读者', pending], ['核心承诺', pending], ['回报节奏', pending], ['禁忌', pending]]),
    'settings/author-intent.md': md('\u4f5c\u8005\u610f\u56fe', [['\u957f\u671f\u8bfb\u8005\u627f\u8bfa', pending], ['\u6838\u5fc3\u60c5\u7eea\u56de\u62a5', pending], ['\u9898\u6750\u8fb9\u754c', pending], ['\u5b8c\u7ed3\u6263\u9898', pending]]),
    'settings/context-policy.json': `${JSON.stringify({ schema_version: '1.0', context_budget_chars: 40000, recent_chapters: 3, cold_memories: 3 }, null, 2)}\n`,
    'settings/style-guide.md': md('文体规范', [['叙事视角', pending], ['语体与节奏', pending], ['禁用模式', pending], ['样句', pending]]),
    'settings/platform-contract.md': md('平台合同', [['平台', meta.genre === '未指定' ? '待首次策划确认' : '番茄小说（以官方页面为准）'], ['官方来源', '记录作家课堂、推荐区、福利/规则页面 URL 与抓取时间。'], ['硬事实', '只填写官方页面明确出现的规则、功能和活动。'], ['启发性信号', '榜单、样本书和第三方文章只作为待验证线索，不写成永久阈值。'], ['开篇验证', '书名/简介承诺、前3章回报、读者理解、继续阅读意愿。'], ['完结验证', '主线回收、伏笔状态、作品完结检查和交付清单。']]),
    'settings/platform-classroom-map.md': '# 番茄作家课堂采用表\n\n> 初始化后先读取 `references/platform/fanqie-writer-classroom-playbook.md`，再把本书采用的规则、证据和例外写入下表。\n\n| 课堂模块 | 本书采用规则 | 证据文件 | 验收状态 |\n|---|---|---|---|\n| 平台认知 | 待填写 | evidence/sources/writer-classroom-index.md | 未完成 |\n| 产品功能 | 待填写 | evidence/sources/writer-classroom-index.md | 未完成 |\n| 题材选择 | 待填写 | analysis/trend-report.md | 未完成 |\n| 前期准备 | 待填写 | settings/outline/ | 未完成 |\n| 正文写作 | 待填写 | outline/chapter-beats.md | 未完成 |\n| 写作进阶 | 待填写 | evidence/snapshots/ | 未完成 |\n',
    'settings/workflow-policy.json': `${JSON.stringify({ schema_version: '1.0', workflow_id: 'book-production', workflow_manifest: 'references/operations/workflow-manifest.json', max_attempts_per_node: 3, node_local_context: true, post_hoc_required_after_chapter: true }, null, 2)}\n`,
    'settings/agent-runner.json': `${JSON.stringify({ schema_version: '1.0', agent_command: 'claude', model: '', agent_args: ['--dangerously-skip-permissions', '--no-session-persistence'], timeout_ms: 900000, max_attempts: 3, chapter_min_chars: 1200, chapter_max_chars: null, panel_readers: 3, panel_attempts: 2, review_interval: 10, chapter_revision_passes: 2, chapter_reader_review: true, chapter_reader_min_score: 7, chapter_fact_extract: true }, null, 2)}\n`,
    'outline/master-outline.md': md('全书大纲', [['目标字数', String(meta.target_words)], ['开局失衡', pending], ['中点改义', pending], ['最低谷', pending], ['终局选择', pending]]),
    'outline/chapter-beats.md': '# 章纲\n\n> 章号使用自然数；正文文件名必须补零为四位，例如第1章写作 `manuscript/ch-0001-标题.md`。表格单元格内不要使用 `|`。\n\n| 章号 | POV | 目标 | 阻力 | 转折 | 得失 | 信息增量 | 情绪变化 | 章尾钩子 |\n|---:|---|---|---|---|---|---|---|---|\n',
    'outline/foreshadowing-ledger.md': '# 伏笔台账\n\n| ID | 埋设章 | 内容 | 强化章 | 回收截止章 | 状态 |\n|---|---:|---|---:|---:|---|\n',
    'state/current-state.md': '# 当前状态\n\nupdated_through: 0\n\n尚未写入正文。\n',
    'state/current-focus.md': md('\u5f53\u524d\u521b\u4f5c\u7126\u70b9', [['\u5f53\u524d\u5377\u76ee\u6807', pending], ['\u8fd9\u4e00\u9636\u6bb5\u5fc5\u987b\u4ea4\u4ed8', pending], ['\u8fd9\u4e00\u9636\u6bb5\u4fdd\u62a4\u7684\u8bbe\u5b9a', pending], ['\u4e0b\u4e00\u4e2a\u7ae0\u8282\u7684\u91cd\u70b9', pending]]),
    'state/foreshadowing-index.json': `${JSON.stringify({ schema_version: '1.0', generated_at: null, source: 'outline/foreshadowing-ledger.md', target_chapter: null, nodes: [], edges: [], due: [], errors: [], warnings: [] }, null, 2)}\n`,
    'state/pacing-ledger.json': `${JSON.stringify({ schema_version: '1.0', updated_at: null, updated_through: 0, entries: [], audit: { warnings: [], recommendations: [] } }, null, 2)}\n`,
    'state/character-state.md': '# 人物状态\n\n| 人物 | 地点 | 身体 | 情绪 | 资源 | 已知信息 | 关系变化 | 截止章 |\n|---|---|---|---|---|---|---|---:|\n',
    'state/timeline.md': '# 时间线\n\n| 时间 | 事件 | 地点 | 参与者 | 证据章节 |\n|---|---|---|---|---|\n',
    'state/unresolved-hooks.md': '# 未解钩子\n\n| ID | 首次出现章 | 问题 | 读者预期 | 回收窗口 | 状态 |\n|---|---:|---|---|---|---|\n',
    'state/feedback-ledger.md': '# 反馈台账\n\n> 只记录真实读者/用户反馈；每条反馈都要转成规则、修改动作和复验结果。\n\n| 日期 | 反馈原句 | 问题层 | 规则化动作 | 复验章节 | 状态 |\n|---|---|---|---|---:|---|\n',
    'state/handoff-current.md': '# 当前会话交接\n\n尚未生成。运行 `node scripts/handoff.js <项目目录>`。\n',
    'state/autopilot.json': `${JSON.stringify({ schema_version: '1.0', mode: 'supervised', status: 'idle', phase: 'idle', target_words: Number(meta.target_words || 1000000), current_chapter: 0, revision_round: 0, max_revision_rounds: 3, chapter_review_interval: 10, last_review_through: 0, updated_at: null }, null, 2)}\n`,
    'state/autopilot-pilot.json': `${JSON.stringify({ schema_version: '1.0', status: 'pending', auto_confirmed: false, reviewed_through: 0, updated_at: null }, null, 2)}\n`,
    'state/chapter-transaction.json': `${JSON.stringify({ schema_version: '1.0', phase: 'idle', chapter: null, updated_at: null }, null, 2)}\n`,
    'state/workflow-run.json': `${JSON.stringify({ schema_version: '1.0', status: 'idle', task_id: null, workflow_id: 'book-production', current_node: null, completed_nodes: [], checkpoints: [], updated_at: null }, null, 2)}\n`,
    'state/autopilot-run.json': `${JSON.stringify({ schema_version: '1.0', status: 'idle', phase: 'prepare', target_words: Number(meta.target_words || 1000000), current_chapter: 0, completed_prepare_nodes: [], panel: { status: 'pending', attempts: 0 }, attempts: {}, updated_at: null }, null, 2)}\n`,
    'state/pilot-verdict.json': `${JSON.stringify({ schema_version: '1.0', status: 'pending', reviewed_through: 0, reviewer: null, reason: null, updated_at: null }, null, 2)}\n`,
    'state/production-ledger.jsonl': '',
    'state/workflow-ledger.jsonl': '',
    'state/post-hoc-ledger.jsonl': '',
    'state/autopilot-run-ledger.jsonl': '',
    'analysis/trend-report.md': '# 趋势报告\n\n尚未执行带来源证据的榜单扫描。\n',
    'analysis/breakdown.md': '# 拆书报告\n\n尚未导入可分析文本。\n',
    'analysis/qa-report.md': '# 质量报告\n\n尚未生成正文。\n',
    'evidence/README.md': '# 证据仓\n\n保存扫榜、来源、拆书、选题、大纲、正文评测和文件依赖。每次运行新增快照，不覆盖历史证据。\n\n- sources/：URL、采集时间、来源等级和摘录\n- snapshots/：不可变扫描快照\n- derivations/：从证据到选题/拆书/大纲的推导\n- lineage/：文件依赖与 SHA-256\n',
    'evidence/sources/source-index.md': '# 来源索引\n\n| ID | 来源 | URL/路径 | 采集时间 | 等级 | 用途 | 下游文件 |\n|---|---|---|---|---|---|---|\n',
    'evidence/sources/writer-classroom-index.md': '# 番茄作家课堂来源索引\n\n- 官方入口：https://fanqienovel.com/writer/zone/tutorial\n- 官方课程合集：https://fanqienovel.com/writer/zone/article/7668202929941119038\n- 采集时间：待首次运行时更新\n- 研究批次：2026-08-08；公开栏目共 5 类，课程正文由技能仓库统一归纳到 `references/platform/fanqie-writer-classroom-playbook.md`。\n\n| 类别 | 官方接口/页面 | 读取数量 | 本书采用规则 | 下游文件 |\n|---|---|---:|---|---|\n| 平台宝典 | https://fanqienovel.com/writer/zone/tutorial?tab=5 | 27 | 待填写 | settings/platform-contract.md |\n| 新手专区 | https://fanqienovel.com/writer/zone/tutorial?tab=1 | 45 | 待填写 | analysis/ |\n| 大神专访 | https://fanqienovel.com/writer/zone/tutorial?tab=2 | 68 | 待填写 | evidence/derivations/ |\n| 写作技巧 | https://fanqienovel.com/writer/zone/tutorial?tab=3 | 60 | 待填写 | outline/、manuscript/ |\n| 品类指南 | https://fanqienovel.com/writer/zone/tutorial?tab=4 | 64 | 待填写 | settings/、outline/ |\n',
    'evidence/snapshots/README.md': '# 扫描快照\n\n文件名使用日期和运行 ID；保留原始响应或导出摘要，不用新结果覆盖旧文件。\n',
    'evidence/derivations/decision-log.md': '# 推导决策日志\n\n| 决策 ID | 日期 | 输入证据 | 决策 | 影响 | 状态 |\n|---|---|---|---|---|---|\n',
    'evidence/lineage/manifest.json': `${JSON.stringify({ schema_version: '1.0', generated_at: null, artifacts: [] }, null, 2)}\n`,
    'supervision/README.md': '# 监管入口\n\n先看 dashboard.md，再看 review-queue.md、decision-log.md 和 stop-conditions.md。没有人工记录时，流程停在监管面板。\n',
    'supervision/dashboard.md': '# 监管面板\n\n- 阶段：idle\n- 生产放行：冻结\n- 下一动作：完成来源快照、拆书、选题和读者契约\n',
    'supervision/decision-log.md': '# 决策日志\n\n| 时间 | 决策 | 触发证据 | 影响 | 状态 |\n|---|---|---|---|---|\n',
    'supervision/review-queue.md': '# 复核队列\n\n| 优先级 | 项目 | 验收条件 | 输出文件 | 状态 |\n|---|---|---|---|---|\n| P0 | 来源快照 | URL、时间、等级齐全 | evidence/sources/ | 待执行 |\n| P0 | 黄金三章冷读 | 读者能复述并愿意继续 | analysis/reader-rejection-*.md | 待执行 |\n',
    'supervision/stop-conditions.md': '# 停止条件\n\n出现作文感、说明书感、看不懂、没有继续欲望或平台调性偏移时，冻结生产，记录反馈并回退到卖点、章拍和文体重构。\n',
    'import/source-map.md': '# 导入映射\n\n尚未导入旧稿。\n',
    'import/continuation-plan.md': '# 续写计划\n\n尚未导入旧稿。\n',
    'manuscript/README.txt': '章节文件命名约定\n\n1. 文件名必须使用 ch-XXXX-标题.md；XXXX 是从 0001 开始的四位章号。\n2. 示例：ch-0001-停电夜.md、ch-0002-规程之外.md。\n3. 第1章也要先生成上下文包：context-pack.js 会使用 settings/ 与 outline/，不依赖前置正文。\n4. 首选事务流程：chapter-transaction begin → 写正文并更新 state → chapter-transaction finish。begin 自动生成 context-pack 并执行写前门；finish 执行字数、状态与 Canon 变更检查。\n5. 用户只说“开始”时运行 autopilot.js start，自动推进扫榜、选题、拆书、试读和生产；需要亲自把关时保持 supervised 模式。\n6. 30万字以上项目在 autopilot 模式需通过独立盲评，在 supervised 模式需真人冷读，再开始第4章。\n',
  };
}

function run(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (!args.title) throw new CliError('USAGE', '用法: node init-project.js --title <书名> [--root 目录] [--genre 题材] [--target-words 数字]');
  const root = path.resolve(args.root || process.cwd());
  const title = safeName(args.title);
  const project = path.resolve(root, title);
  const relative = path.relative(root, project);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new CliError('PATH_ESCAPE', '项目路径超出根目录', { root, project });
  if (fs.existsSync(project) && fs.readdirSync(project).length) throw new CliError('PROJECT_EXISTS', '目标项目目录非空，未覆盖', { project });
  fs.mkdirSync(project, { recursive: true });
  const targetWords = Number.parseInt(args['target-words'] || '1000000', 10);
  if (!Number.isFinite(targetWords) || targetWords <= 0) throw new CliError('INVALID_TARGET_WORDS', '目标字数必须为正整数', { value: args['target-words'] });
  const meta = { schema_version: '1.0', title: args.title, directory_name: title, genre: args.genre || '未指定', target_words: targetWords, updated_through: 0, created_at: new Date().toISOString() };
  const files = templates(meta);
  files['state/project-state.json'] = `${JSON.stringify(meta, null, 2)}\n`;
  for (const [name, contents] of Object.entries(files)) atomicWrite(path.join(project, name), contents);
  fs.mkdirSync(path.join(project, 'manuscript'), { recursive: true });
  const report = { ok: true, project, files_created: Object.keys(files).length, state: meta };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { process.exitCode = emitError(error, 'init-project'); }
}

module.exports = { argsOf, safeName, templates, run };
