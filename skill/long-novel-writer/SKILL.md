---
name: long-novel-writer
description: 长篇网络小说的一体化创作与项目管理技能。用于用户提出长篇、开书、选题、榜单/趋势扫描、拆书、写大纲、黄金三章、章节续写、批量正文、去 AI 痕迹、质量检查、导入旧稿或跨会话续写时；覆盖市场证据、读者契约、人物与关系、世界观、冲突/爽点/情感线、卷纲与章纲、正文交付、状态台账和一致性验证。
---

# 长篇小说写作

把每部长篇当作可恢复、可验证、可持续迭代的项目，而不是一次性文本。保持用户语言、类型、叙事视角和已确认设定。

## 路由请求

| 用户意图 | 先做 | 随后做 |
|---|---|---|
| “开书、写长篇、从零开始” | Phase 1–3 | 建档后按需进入正文 |
| “扫描榜单、找趋势、选题” | Phase 1 | 输出带来源日期的候选矩阵 |
| “拆这本书/分析样章” | Phase 2 | 输出商业三角、结构与可迁移机制 |
| “做设定/人物/世界观” | Phase 3 | 更新故事圣经与读者契约 |
| “写大纲/卷纲/章纲” | Phase 3 | 同步伏笔、时间线和章节承诺 |
| “写第 N 章/续写/批量写” | Phase 4 | 每章后更新状态并执行 Phase 5 |
| “改稿/去 AI 味/质检” | Phase 5–6 | 输出修改稿与问题清单 |
| “导入旧小说/接着写” | Phase I1–I5 | 重建状态后续写，不重置已知事实 |

若用户给出明确章节、字数和设定，直接执行对应阶段；不要强制重跑前序阶段。若缺少少量参数，用类型惯例形成紧凑假设并在交付开头列出。

## 先诊断再调用模块

写作前先判断故障位于读者、承诺、结构、Canon 还是表达层，再读取 `references/writing/module-routing.md` 指定的一个主模块和一个校验模块。不要把整套参考资料一次性加载；项目的 `settings/`、`outline/`、`state/` 文件始终优先于通用模板。相同问题第二次出现时，必须沉淀到反馈台账并增加可复验动作。

## 无人值守模式

当用户只说“开始”且未指定人工确认点时，默认进入 `autopilot`：自动扫榜、选题、拆书、建纲、生成黄金三章、盲评返工、逐章生产、每卷审计并推进到完结。所有选题必须绑定带时间戳的来源和置信度；证据不足时自动淘汰候选并重新采集，不把选择题抛回用户。运行状态写入 `state/autopilot.json`，阶段切换使用 `scripts/autopilot.js`。

需要用户亲自把关时才使用 `supervised`。两种模式都保留 Canon 锁、章节事务、上下文包、读者指标、质量检查、反馈台账和 handoff；自动模式只是把真人试读替换为独立盲评门禁，不跳过质量检查。

启动无人值守编排：

```powershell
node <技能目录>/scripts/autopilot.js start <项目目录>
node <技能目录>/scripts/autopilot.js status <项目目录>
```

## 建立项目

默认在当前工作区创建 `<书名或项目名>/`；清理名称中的路径字符，不覆盖非空目录。优先运行确定性初始化器：

```powershell
node <技能目录>/scripts/init-project.js --root <工作区> --title <书名> --genre <题材> --target-words <目标字数>
```

建立：

```text
<项目>/
├─ settings/
│  ├─ story-bible.md          # 题材、卖点、世界规则、边界
│  ├─ characters.md           # 角色欲望、恐惧、秘密、能力、弧线
│  ├─ relations.md            # 关系张力与变化节点
│  ├─ reader-contract.md      # 类型承诺、目标读者、回报节奏
│  ├─ platform-contract.md    # 官方平台事实、观察信号、更新时间
│  └─ style-guide.md          # 视角、语体、禁区、样句
├─ outline/
│  ├─ master-outline.md       # 全书阶段与终局
│  ├─ volume-XX.md            # 卷目标、阻力、反转、卷尾承诺
│  ├─ chapter-beats.md        # 每章目标/冲突/转折/钩子
│  └─ foreshadowing-ledger.md # 埋设、强化、回收、截止章
├─ manuscript/ch-XXXX-title.md
├─ state/
│  ├─ current-state.md        # 最新章结束时的事实快照
│  ├─ project-state.json      # 机器可读版本、项目参数、落盘章号
│  ├─ character-state.md
│  ├─ timeline.md
│  ├─ unresolved-hooks.md
│  ├─ feedback-ledger.md       # 用户/读者反馈→规则→复验
│  ├─ handoff-current.md       # 可恢复的跨会话交接
│  ├─ autopilot.json            # 无人值守阶段、模式与恢复点
│  ├─ autopilot-pilot.json      # 自动盲评放行记录
│  ├─ chapter-transaction.json # 当前章事务、Canon 锁与门禁结果
│  └─ production-ledger.jsonl  # 逐章通过/失败/中止审计账本
├─ analysis/
│  ├─ trend-report.md
│  ├─ breakdown.md
│  └─ qa-report.md
└─ import/
   ├─ source-map.md
   └─ continuation-plan.md
```

用 `references/writing/artifact-protocols.md` 的字段写文件。每次续写先读取 `settings/`、相关卷纲、最近 2–3 章和 `state/`，不要把记忆当作事实源。接管已有项目时先运行 `scripts/validate-project.js` 并传入项目目录；若失败，先修复缺章、台账滞后或重复 ID，再写新章。

## Phase 1：扫描与选题

1. 明确平台、读者性别/年龄层、频道、字数带和时间窗。
2. 请求“当前榜单/趋势”时使用可用网页或用户导出数据，记录来源、抓取时间、榜单口径和样本量；绝不把常识伪装成实时结果。网页抓取优先用 Firecrawl 结构化提取，动态页面按平台配置等待必要内容。
3. 把作品归一为：题材标签、核心欲望、主角初始位、金手指/资源、首个强承诺、更新/字数、标题词根、简介承诺。
4. 聚类重复机制，区分“稳定需求”与“短期拥挤”。
5. 输出 3–5 个候选：一句话卖点、目标读者、熟悉感、差异点、前 10 章兑现、同质化风险、证据强度。

官方平台页面写入 `settings/platform-contract.md`；将“官方硬事实”“本次样本观察”“第三方启发”分栏保存，并记录抓取日期。第三方文章中的固定推荐阈值只作为待验证假设，不直接约束正文。

读取 `references/scanning/source-evidence.md`、`references/scanning/firecrawl-ranking.md`、`references/scanning/genre-trends.md` 与 `references/analysis/trend-analysis.md`。统一入口：

```powershell
# 离线导出：支持 JSON/JSONL/HTML table/CSV/TSV/Markdown pipe
node <技能目录>/scripts/rank-scan.js --platform qimao --input <导出文件> --out <快照.json>
# 在线扫描：云端需 FIRECRAWL_API_KEY；自托管可设置 FIRECRAWL_API_URL
node <技能目录>/scripts/rank-scan.js --platform fanqie --out <快照.json> --evidence <原始响应.json>
# 先核对 URL、交互和请求结构，不消耗抓取额度
node <技能目录>/scripts/rank-scan.js --platform fanqie --dry-run
```

若结果为空，停止趋势推断并报告结构化错误；不以空样本、搜索摘要或旧缓存生成“当前榜单”。

## Phase 2：拆书

1. 只基于用户提供或可访问文本，不虚构未读章节。
2. 先写**商业三角**：读者是谁、承诺什么回报、凭什么持续升级。
3. 再拆：开篇承诺、每 3–5 章节拍、信息差、冲突升级、关系变化、爽点/虐点、伏笔回收、章尾钩子、语言节奏。
4. 区分“可迁移机制”和“不可复刻表层”，避免换名复写。
5. 用表格输出“位置—作用—手段—证据—可迁移规则—风险”。

读取 `references/analysis/book-deconstruction.md`、`commercial-triangle.md`、`comparative-reading.md`。

## Phase 3：设定与大纲

按顺序锁定：

1. **读者契约**：类型、情绪回报、禁忌、兑现频率。
2. **核心驱动**：主角外在目标 + 内在缺口 + 对抗力量 + 失败代价 + 独特资源。
3. **人物与关系**：每个主角具备欲望、恐惧、秘密、错误信念、可见行为；关系必须因事件改变。
4. **世界规则**：能力/制度的成本、上限、例外和可验证后果。
5. **全书骨架**：开局失衡→连续升级→中点改义→最低谷→终局选择。
6. **卷纲**：每卷仅设一个主问题，卷末完成回报并打开更大问题。
7. **章纲**：每章写 POV、目标、阻力、转折、获得/损失、信息增量、情绪变化、章尾钩子。

黄金三章依次完成：第 1 章异常与明确欲望；第 2 章代价与行动；第 3 章不可逆选择与长线承诺。按题材读取 `references/writing/genre-prose-cards/` 中对应卡片，并按需读取人物、大纲、钩子、情感与读者画像参考。

开新书时同时读取 `references/writing/platform-pilot-and-readability.md` 与 `references/writing/reader-metrics.md`。黄金三章必须先证明“普通读者看得懂、愿意追”，再证明设定复杂；每章新增需记忆概念默认不超过 3 个，连续解释不超过 150 个中文字符，且不得提前消费下一章章拍。30 万字以上项目写完第 3 章后暂停，由目标读者直接冷读正文；模型自评和脚本通过不能替代真人放行。

## Phase 4：正文写作

1. 先从章纲提取本章“承诺—阻力—变化—钩子”及人物/道具/伏笔查询词；优先运行 `scripts/chapter-transaction.js` 的 `begin` 命令，让脚本自动生成上下文包、执行写前门并锁定 Canon。门禁失败时修复输入，不越过失败继续批量写。
2. 让段落承担动作、观察、判断或关系变化；删除只复述情绪的句子。
3. 用可见选择体现人物，不用作者替人物解释。
4. 对话必须包含目的、潜台词和地位变化；角色说话方式可区分。
5. 场景至少发生一个不可撤销的小变化；章尾改变问题、风险或认知。
6. 批量写作默认每批 1–3 章；逐章落盘，禁止用“略”“待补”“战斗若干”代替正文。
7. 交付前统计有效中文字符/词数，核对用户要求；有明确章长区间时，写后门同时传 `--min-chars` 与 `--max-chars`，超限则拆分或收束本章。
8. 写完立即更新当前状态、机器状态、人物状态、时间线、未解钩子和伏笔台账；运行 `scripts/chapter-transaction.js` 的 `finish` 命令。它通过字数、连续性、状态和 Canon 变更检查并写入生产账本后，才开始下一章。

9. 交接前运行 `node scripts/handoff.js <项目目录>`，把最新状态、未解钩子、事务、试读 verdict 和下一动作写入 `state/handoff-current.md`；下一次会话先读该文件，再按模块路由补充上下文。

写后追加 `node scripts/reader-metrics.js <章节>`；它只提供开头延迟、解释块、对白比例和章尾形状的证据。任何预警先做结构/读者判断，不得用删词把预警刷成通过。

机械 `finish` 只表示工程状态完整，不表示读者体验合格。30 万字以上项目开始第 4 章前：`supervised` 模式记录真人试读结论；`autopilot` 模式生成至少 3 个独立评审的盲评 JSON，并运行：

```powershell
node <技能目录>/scripts/pilot-review.js status <项目目录>
node <技能目录>/scripts/pilot-review.js approve <项目目录> --reviewed-through 3 --reviewer <真人> --reason "愿意继续读的具体原因" --human-confirmed
# 无人值守模式：盲评 JSON 必须满足 reader_score/platform_fit >= 8、理解通过率 >= 0.8、继续阅读率 >= 0.67
node <技能目录>/scripts/autopilot.js pilot-pass <项目目录> --evidence <自动盲评.json>
```

若真人反馈或自动盲评显示看不懂、拖沓、不舒服或平台错位，自动停止续章；回到卖点、读者契约、黄金三章章拍和文体样章重构，不在失败稿后继续堆字。无人值守模式最多自动返工 3 轮，仍未通过则回退到 `breakdown` 阶段。

正文文件名固定为 `manuscript/ch-XXXX-标题.md`，章号从 `0001` 开始补零为四位。第 1 章同样先运行 `context-pack.js --chapter 1`；它会从 `settings/` 与 `outline/` 生成首章上下文包，不依赖前置正文。章纲表格必须保持 9 列，单元格内不要写 `|`。

用户明确章长为 2500–3500 个中文字符时，写后使用完整门禁命令：

```powershell
node <技能目录>/scripts/chapter-gate.js <项目目录> --stage post --chapter <N> --min-chars 2500 --max-chars 3500
```

连续生产首选完整事务：

```powershell
node <技能目录>/scripts/chapter-transaction.js begin <项目目录> --chapter <N> --query "人物 道具 伏笔" --min-chars 2500 --max-chars 3500
# 写作并更新 state 后
node <技能目录>/scripts/chapter-transaction.js finish <项目目录> --chapter <N>
```

需要体裁语感时读取对应正文卡；无人值守编排读取 `autopilot-orchestration.md` 与 `target-anchored-evaluation.md`；连续生成、Canon 锁和中断恢复时读取 `production-orchestration.md` 与 `context-and-gates.md`；需要技巧时读取 `dialogue-mastery.md`、`writing-craft.md`、`hooks-*.md` 和 `format-and-structure.md`。

## Phase 5：质量检查

执行三维检查：

1. **情绪交付**：本章让目标读者期待、紧张、满足或心疼的具体位置是什么？回报是否兑现或合理延期？
2. **契约安全**：是否偏离题材承诺、人物底线、视角、世界规则和平台尺度？
3. **一致性**：时间、地点、称谓、能力、物品、伤势、知情范围、关系与伏笔是否连续？

随后运行：

```powershell
node scripts/check-ai-patterns.js <章节或目录> --json
node scripts/check-degeneration.js <章节或目录> --json
node scripts/normalize-punctuation.js <章节或目录> --check
node scripts/cap-utils.js count <章节或目录>
node scripts/evidence-audit.js <项目目录> --input <目标锚点与审计.json>
node scripts/validate-project.js <项目目录>
node scripts/chapter-transaction.js status <项目目录>
```

检查脚本只提供线索，不做机械删改。标点确需落盘时运行 `normalize-punctuation.js <路径> --write`，默认先生成 `.bak` 并原子替换；若要保留源目录，使用 `--out-dir <目录>`。把严重问题、证据片段、建议动作和复核结果写入 `analysis/qa-report.md`。

第 6 章检查一次新鲜度衰减，之后每 10 章做冷读与跨章重复检查；每卷做读者承诺、角色弧、问题/承诺、伏笔、节奏和 Canon 冲突审计。正文因果链保持顺序写作，审校视角可并行。相同失败出现两次，就把它沉淀为规则或确定性测试。

黄金三章逐章做通俗复述：目标读者若不能用一句口语说清“主角要什么、遇到什么麻烦、这章赢或输了什么”，本章判为读者体验失败，即使所有脚本返回 `ok: true`。反馈优先级高于自动评分。

## Phase 6：去 AI 痕迹七道门

依次执行并保留剧情事实：

1. **禁用词门**：删除空泛套话和高频过渡词串。
2. **句法套路门**：打散同构排比、连续“不是…而是…”和均匀句长。
3. **心理解释门**：把情绪标签改为动作、选择、误判或身体反应。
4. **节奏门**：允许必要的短促、停顿、跳切和留白，避免段段总结。
5. **对话门**：删除礼貌完整答句，加入回避、抢话、错位回应与角色口癖。
6. **结尾门**：停止升华、感悟和主题总结，以新信息/动作/代价/决定收束。
7. **解释腔门**：信任读者；同一信息只保留最有力量的一次。

读取 `references/deslop/anti-ai-writing.md`、`banned-words.md`、`dialogue-naturalness.md` 和 `ending-discipline.md`。修改后重跑 Phase 5，防止去痕破坏连续性。

## Phase I1–I5：导入与续写

1. **I1 清点**：记录文件、章节边界、缺章、乱码和重复段。
2. **I2 映射**：统一章号、标题、视角、时间与人物别名，写 `source-map.md`。
3. **I3 逆向状态**：仅从已出现证据恢复人物、关系、道具、伤势、知情范围和未解问题；不确定项标注置信度。
4. **I4 重建结构**：推断现处全书/卷/情感弧阶段，提出 2–3 条续写路线及对既有承诺的影响。
5. **I5 续写**：选定路线后创建章纲，按 Phase 4 写作、按 Phase 5 验证。

先运行 `scripts/import-inventory.js`，传入旧稿路径和 `--project <项目目录>`，生成带 SHA-256、章节标题、缺章/重复和编码诊断的 `import/inventory.json` 与 `source-map.md`；再读取 `references/import/` 全部相关文档。文本过长时分块处理，并在每块后合并状态而不是只保留摘要。

## 输出纪律

- 保留用户已确认事实；新假设集中列出，不悄悄改设定。
- 区分“证据”“推断”“建议”。实时扫描附来源与日期，文本分析附章节或片段位置。
- 交付正文时先给正文，再给不超过必要程度的检查摘要。
- 不在正文插入写作说明、占位符、模型自评或工具日志。
- 修改已有稿件时保存原稿或生成新版本，并列出改动范围；脚本写入采用同目录临时文件后原子替换。
- 每次行动产生文件、章节、报告、状态更新或明确决策之一。

## 参考导航

- 扫描：`references/scanning/`
- 拆书与质检：`references/analysis/`
- 设定、大纲、写作、题材卡：`references/writing/`
- 去 AI 痕迹：`references/deslop/`
- 导入续写：`references/import/`
- 可执行检查与榜单解析：`scripts/`


## Human cold-read priority and evidence vault

When a reader reports composition-like prose, weak continuation desire, platform mismatch, or hard-to-evaluate opening, load references/writing/reader-first-webnovel-repair.md, freeze production, and rewrite chapter 1. Automated metrics are preflight only.

Every project stores source URLs and timestamps, immutable scan snapshots, breakdown/selection/outline derivations, dependency hashes, and a supervision dashboard. Initialization creates evidence/ and supervision/. Run scripts/project-audit.js <PROJECT> --write-manifest to refresh lineage. See references/operations/evidence-vault-and-supervision.md.

## Official platform curriculum routing

For Tomato/Fanqie projects, load `references/platform/fanqie-writer-classroom-playbook.md` before scanning, outlining, or drafting. It is the execution summary of the official Writer Classroom's platform, beginner, genre, craft, and author-interview material. Record the source batch and the project-specific adoption decisions in `evidence/sources/writer-classroom-index.md` and `settings/platform-classroom-map.md`; do not replace the playbook with generic web-writing advice. The classroom gates (topic promise, golden rhythm, opening/hook, scene/action/emotion/dialogue, character network, upgrade logic, update buffer, and completion audit) are release criteria, not optional polish.

Run `node scripts/classroom-audit.js <PROJECT>` before production. A `ready_for_classroom_release: false` result keeps the project in planning/rewrite until all five official categories are mapped and the project has no pending classroom adoption items.
## Deterministic workflow runtime

The writing rules are executed through the bundled workflow contract rather than one long agent turn. Read `references/operations/workflow-runtime.md` and `references/operations/workflow-manifest.json` when starting or resuming a book. The seven nodes are `build -> character -> story-plan -> outline -> mvp -> post-hoc -> polish`.

Run `scripts/workflow-runner.js` with the `start <PROJECT>` arguments once, then checkpoint each node with real artifact paths. On a failure, record it with `fail`, use `retry` for the same node, and resume from its checkpoint. After every chapter, run `post-hoc` before opening the next chapter transaction. The runner freezes the manifest hash, records attempts and artifact hashes, and never claims that prose was generated by a model.

## Durable autopilot bridge

For a single-start unattended execution path, use the durable bridge:

```powershell
node scripts/autopilot-runner.js start <PROJECT>
node scripts/autopilot-runner.js run <PROJECT> --model "MODEL" --quiet
node scripts/autopilot-runner.js status <PROJECT>
```

`autopilot-runner.js` invokes the configured Agent, saves every prompt and transcript under `state/agent-runs/`, retries bounded failures, commits one chapter at a time, runs post-hoc continuity, performs the three-reader pilot, and pauses on a rejection or failed gate. `--max-chapters` is a resumable budget slice for tests; omit it for the configured target word count. Read `references/operations/autopilot-runner.md` before changing the command or model adapter.

## 番茄正文格式与流水账门禁

写作时把 `references/writing/format-and-structure.md` 当作发布格式契约，而不是把大纲表格直接改成正文。每章交付前运行 `scripts/format-gate.js`（参数为章节路径和 `--json`）；它检查移动端段落密度、长句、空行、对白独立成段、Markdown 残留、场景推进和“然后—接着—随后”式流水账链。`chapter-gate.js --stage post` 与 `autopilot-runner.js` 已自动接入该门禁：格式错误或流水账硬错误会让当前章节回到重写，低事件密度和对白缺失只进入冷读警告。

## Durable context, memory, and foreshadowing

Before a chapter transaction, retain `settings/author-intent.md` as the long-term book compass and update `state/current-focus.md` as the near-term arc target. `chapter-transaction begin` now rebuilds the typed foreshadowing index and the context pack; `finish` saves a hash-bound chapter capsule. Read `references/operations/long-context-loop.md` before changing the compass, pack policy, memory, or ledger. Use `scripts/chapter-memory.js` validate <PROJECT> --chapter <N> and `scripts/foreshadowing-index.js` <PROJECT> --chapter <N> --write for direct verification.

## Chapter card and bounded repair

Every transaction creates `state/chapter-cards/ch-XXXX.json` from the beat, due foreshadowing, and character knowledge boundary, then puts it in the critical context tier. The chapter agent follows its three-scene delivery contract. When deterministic draft findings occur, the runner performs bounded Draft B/C repairs before the transaction commits, with every repair recorded in chapter QA. Read `references/operations/chapter-card-and-revision-loop.md`; use `scripts/chapter-card.js` build or validate commands when inspecting a chapter contract.

## Chapter cold-reader review

Every Draft A receives an independent cold-reader report before the runner
chooses Draft B/C. The reviewer neither writes prose nor changes Canon. The
report is saved as `analysis/chapter-reader-review-chXXXX-rNN.json`; each issue
must contain an exact manuscript quote. A score below the project threshold, a
critical issue, or a `revise` verdict triggers repair and a new review in the
same chapter transaction. A chapter with an unresolved report never commits.
Read `references/operations/chapter-reader-review-loop.md`; validate one report
with `scripts/chapter-reader-review.js`.

Every repair starts from a snapshot, receives a deterministic repair brief, and
is kept only when its deterministic debt or cold-reader evidence measurably
improves. A plateau restores the prior manuscript and leaves the chapter open
for a fresh production attempt; snapshots live under `state/chapter-revisions/`.
