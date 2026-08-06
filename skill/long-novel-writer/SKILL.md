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
│  └─ unresolved-hooks.md
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

## Phase 4：正文写作

1. 先从章纲提取本章“承诺—阻力—变化—钩子”及人物/道具/伏笔查询词；运行 `scripts/context-pack.js` 生成目标章上下文包，再运行 `scripts/chapter-gate.js` 的 `--stage pre`。门禁失败时修复输入，不越过失败继续批量写。
2. 让段落承担动作、观察、判断或关系变化；删除只复述情绪的句子。
3. 用可见选择体现人物，不用作者替人物解释。
4. 对话必须包含目的、潜台词和地位变化；角色说话方式可区分。
5. 场景至少发生一个不可撤销的小变化；章尾改变问题、风险或认知。
6. 批量写作默认每批 1–3 章；逐章落盘，禁止用“略”“待补”“战斗若干”代替正文。
7. 交付前统计有效中文字符/词数，核对用户要求；有明确章长区间时，写后门同时传 `--min-chars` 与 `--max-chars`，超限则拆分或收束本章。
8. 写完立即更新当前状态、机器状态、人物状态、时间线、未解钩子和伏笔台账；运行 `scripts/chapter-gate.js` 的 `--stage post`，通过后才开始下一章。

正文文件名固定为 `manuscript/ch-XXXX-标题.md`，章号从 `0001` 开始补零为四位。第 1 章同样先运行 `context-pack.js --chapter 1`；它会从 `settings/` 与 `outline/` 生成首章上下文包，不依赖前置正文。章纲表格必须保持 9 列，单元格内不要写 `|`。

需要体裁语感时读取对应正文卡；需要上下文分层与中断恢复时读取 `context-and-gates.md`；需要技巧时读取 `dialogue-mastery.md`、`writing-craft.md`、`hooks-*.md` 和 `format-and-structure.md`。

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
node scripts/validate-project.js <项目目录>
```

检查脚本只提供线索，不做机械删改。标点确需落盘时运行 `normalize-punctuation.js <路径> --write`，默认先生成 `.bak` 并原子替换；若要保留源目录，使用 `--out-dir <目录>`。把严重问题、证据片段、建议动作和复核结果写入 `analysis/qa-report.md`。

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
