# X / GitHub 长篇 AI 写作实践调研

采集时间：2026-08-07（Asia/Shanghai）
目标：为 `long-novel-writer` 补齐百万字生产中的调度、记忆、Canon、质量债务和恢复机制。

## 样本选择

优先级：近期仍活跃 → 有可检查实现 → 社区星标/互动较高 → 与长篇连续生产直接相关。星标和更新时间来自 GitHub API 当日快照。

| 项目 | Stars | 最近推送 | 采用的关键经验 |
|---|---:|---|---|
| [YILING0013/AI_NovelGenerator](https://github.com/YILING0013/AI_NovelGenerator) | 5,826 | 2026-08-01 | 定稿后同步全局摘要、人物状态、剧情线与检索库；章节前检索历史事实 |
| [NousResearch/autonovel](https://github.com/NousResearch/autonovel) | 1,388 | 2026-03-20 | foundation 评分出口、逐章 keep/discard、最多 5 次重试、质量债务、4 角色读者评审、连续两轮平台期停止 |
| [MaoXiaoYuZ/Long-Novel-GPT](https://github.com/MaoXiaoYuZ/Long-Novel-GPT) | 1,202 | 2025-11-05 | 大纲→章节剧情→正文分层扩写；正文与剧情纲要同步更新 |
| [RhythmicWave/NovelForge](https://github.com/RhythmicWave/NovelForge) | 1,089 | 2026-08-04 | Schema-first 卡片、多轮字数预算、结构化审核结果、节点级进度与中断恢复、动态状态抽取 |
| [Doriandarko/gemini-writer](https://github.com/Doriandarko/gemini-writer) | 313 | 2025-12-24 | 长上下文压缩阈值和迭代上限；提醒上下文预算必须显式管理 |
| [danjdewhurst/story-skills](https://github.com/danjdewhurst/story-skills) | 139 | 2026-06-11 | 章前逐拍、场景级机器状态、问题/承诺独立索引、时间线和反向链接维护 |
| [EdwardAThomson/NovelWriter](https://github.com/EdwardAThomson/NovelWriter) | 73 | 2026-07-29 | 工作流 checkpoint、步骤状态、重试计数、输出文件扫描与恢复 |
| [hottweelz/writing-template-for-ai](https://github.com/hottweelz/writing-template-for-ai) | 9 | 2026-06-29 | Canon 权威链、禁止静默 Canon 变更、冷读评审、编辑交接证据 |

低星项目只在存在明确、可检查且高星项目尚未覆盖的机制时纳入。AGPL 或许可证未声明的项目只提炼方法，没有复制其实现代码。

## X 高互动实践

X 搜索页在当前浏览器持续停留于 Loading，因此使用搜索引擎当日可索引的公开 X 状态页核对正文和可见互动快照。

1. [tetsuo：把运行轨迹转成提示词、工具顺序和上下文策略修复](https://x.com/tetsuoai/status/2032031965575332172)——约 12K views，页面显示 174 赞。核心不是再加一次提示，而是保存工具调用、阶段转换、上下文预算与失败模式；重复错误形成可发布的规则或 PR。
2. [Oikon：Claude Code hooks、任务完成事件和持久 memory](https://x.com/oikon48/status/2019622579359609178)——约 10.8K views，页面显示 71 赞。可迁移点是由生命周期事件驱动状态提交，而不是相信模型会在最后记得更新。
3. [Nainsi Dwivedi：Hooks + Batch + Agents 形成自测工作流](https://x.com/NainsiDwiv50980/status/2039379859638821146)——约 7.8K views，页面显示多项互动计数。可迁移点是任务分工和自动验证；相邻正文仍保持顺序，批量并行用于审校和抽取。
4. [Boris Cherny：问题已在新版本修复，先升级再复现](https://x.com/bcherny/status/2036669513924821496)——约 10.5K views。可迁移点是运行报告记录工具版本，区分技能缺陷与宿主版本缺陷。

## 交叉验证后的共识

### 1. Canon 是控制面，不是附属笔记

人物、世界、时间、知情范围、卷级承诺和文体必须来自文件。润色若改变因果、动机或知情范围，应被当作 Canon 变更而不是普通编辑。

### 2. 每章是可回滚事务

正确边界是：生成上下文 → 写前门 → 锁定 Canon → 起草 → 状态提交 → 写后门 → 记录哈希。任何一步失败都留在本章，下一章没有放行资格。

### 3. 记忆必须分层且可追溯

固定加载全局契约、卷/章拍和当前状态；携带最近章节；按人物、道具、伏笔召回较早证据；保留源文件和哈希。检索结果只是候选，不自动升级为事实。

### 4. 质量评审要分层

机械检查负责字数、占位、重复、文件和状态；专门评审分别看人物、连续性、节奏和文体；冷读只看正文与读者契约。多个评审形成共识后再做结构性改动。

### 5. 长程会出现新鲜度衰减

autonovel 的实跑记录指出前 1–6 章通常高于后续章节。百万字项目需要第 6 章早检和每 10 章复检，关注开场、章尾、句长、场景类型与信息传递方式是否模板化。

## 本轮落地

- 新增 `scripts/chapter-transaction.js`：`begin / finish / status / abort`。
- `begin` 自动生成上下文包、执行写前门、锁定章号/字数/Canon 哈希。
- `finish` 检查硬字数、状态提交和 Canon 变化；通过后记录正文哈希与生产事件。
- 新增 `state/chapter-transaction.json` 与 `state/production-ledger.jsonl`。
- 新增显式 Canon 变更批准：`--approve-canon --reason`。
- 新增 `references/writing/production-orchestration.md`：批次、检查点、冷读、重试和停止规则。
- 新增 5 项回归覆盖：CLI 错误契约、自动上下文/写前门、活动事务互斥、失败后留在原章、Canon 变更审计。
- 第 4 章已用新调度器开启事务：上下文 15 个来源、章长 2500–3500、当前状态 `drafting`。

## 明确没有照搬的做法

- 不把相邻正文交给几十个 Agent 并行生成；因果错误会成批传播。
- 不把百万字全文每次塞入上下文；采用热状态、近期正文和证据检索分层。
- 不把单一 LLM 自评分当作放行条件；确定性门禁优先，主观评分只作复核。
- 不追求一次生成全书；按 1–3 章事务批次推进，稳定后上限为 5 章。
