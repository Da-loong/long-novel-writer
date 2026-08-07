# 无人值守编排协议

本协议在保留 Canon 锁、章节事务、上下文包、读者指标、质量检查和断点交接的基础上，把用户的“开始”扩展为持续运行的状态机。它不改变正文事实源，只改变阶段推进方式。

## 两种运行模式

| 模式 | 默认门禁 | 适用场景 |
|---|---|---|
| `supervised` | 第 4 章前需要真人冷读 | 用户要亲自把关，保留现有流程 |
| `autopilot` | 第 4 章前需要独立自动盲评 | 用户只说“开始”，由系统自行选题、返工和续写 |

新项目默认保留 `supervised` 兼容性；用户只说“开始”时，Skill 自动执行 `autopilot.js start`，不再逐步询问题材、书名或大纲选项。

## 阶段状态机

```text
idle → discover → select → breakdown → design → pilot → production ↔ review → complete
```

- `discover`：扫榜、抓取时间、来源、样本量和证据快照。
- `select`：对题材、书名、卖点、读者回报和竞争度打分，选择最高置信度方案。
- `breakdown`：拆解样本的开篇承诺、章拍、爽点、冲突和回收机制，只提取可迁移机制。
- `design`：完成读者契约、故事圣经、人物、卷纲、章纲和伏笔台账。
- `pilot`：生成黄金三章，执行读者指标和独立盲评。
- `production`：逐章执行 `begin → 写作 → 更新状态 → finish → reader-metrics`。
- `review`：每 10 章、每卷中点和卷尾审计重复、节奏、Canon、承诺兑现和平台调性；论文所示中段风险更高，因此中段审计优先级提升；失败则回到生产或设计。
- `complete`：完成全书审计、交接文件、章节目录和交付包。

## 自动选项规则

当用户未指定选题时，禁止凭偏好选择。候选必须包含：

1. 至少两个带时间戳的来源；
2. 榜单位置、更新活跃度、样本量和来源 URL；
3. 核心承诺、目标读者、前 3 章兑现方式；
4. 同质化风险与可迁移差异点；
5. 置信度分数。

证据不足的候选自动淘汰；全部候选不足时重新采集，而不是询问用户随便选一个。

## 自动试读放行

`autopilot.js pilot-pass` 只接受结构化盲评 JSON，至少需要：

- 3 个独立评审报告；
- `reader_score >= 8`；
- `platform_fit >= 8`；
- `comprehension_pass_rate >= 0.8`；
- `continuation_rate >= 0.67`；
- `critical_failures = 0`；
- 已评审第 1–3 章。

提交前先运行 `node scripts/evidence-audit.js <项目目录> --input <自动盲评.json>`；它会核对目标锚点、读者复述和每条 finding 的 `path + quote` 是否真实存在。

任一条件失败，自动重写黄金三章，最多 3 轮；仍失败则回退到 `breakdown`，重做卖点、读者契约和章拍，不在失败骨架上堆写。

## 自动生产与恢复

每章必须保留事务、Canon 快照、上下文包、指标报告和失败次数。进程中断后先读 `state/autopilot.json` 与 `state/handoff-current.md`，从最后一个完成阶段继续。所有自动选择和修订都写入 `state/production-ledger.jsonl`。

## 质量边界

自动盲评是无人值守的质量代理，不把模型自评当作读者事实。`reader-metrics.js`、结构门禁和盲评必须同时通过；工程通过不代表读者体验通过。
