# long-novel-writer

[![ci](https://github.com/Da-loong/long-novel-writer/actions/workflows/ci.yml/badge.svg)](https://github.com/Da-loong/long-novel-writer/actions/workflows/ci.yml)

面向中文长篇网络小说的 Codex/Agent Skill。目标不是“一键声称写完百万字”，而是把开书、拆书、设定、大纲、正文、连续性、质检、榜单证据和旧稿导入做成可验证工程。

公开仓库：https://github.com/Da-loong/long-novel-writer

## 当前状态

- 版本：`0.3.0-rc.1`
- 初始基线：`7.5/10`
- 当前仓库评测：`8.68/10`（120 项自动测试通过，并包含一次三读者前三章盲读前向运行）
- 发布门槛：任务级加权评测 `>= 8.5/10`，且无 P0、P1 未关闭问题
- 支持环境：Windows、Linux；Node.js 20+
- GitHub：公开仓库已建立；以 `main` 分支 CI 和发布门禁作为合并基线

本仓库不会用文件数量、README 声明或单一绿色测试证明“生产可用”。能力必须同时具备实现、失败语义、测试夹具和任务级证据。`8.67` 是仓库验收量表结果，不是对任意题材、任意百万字成稿质量的保证；新鲜盲读已覆盖前三章，当前公开保留的 P2 项是异能规则边界和第三章因果密度。

## 已实现能力

- 从开书、读者契约、人物/世界规则、大纲到逐章正文的统一路由。
- 32 类差异化题材卡，每张包含长篇循环、黄金三章、升级刻度、状态字段和失误预警。
- 项目初始化、状态校验、Hot/Warm/Cold 上下文打包、章节事务、Canon 哈希锁、写作前门与落盘后门。
- JSON、JSONL、HTML table、CSV/TSV/pipe 榜单导入；Firecrawl v2 结构化抓取、请求预览、原始证据和空结果阻断。
- 旧稿哈希清点、章节标题映射、缺章/重复章/编码损坏诊断。
- AI 套路线索、退化/占位/重复检测、字符统计和带备份的原子标点规范化。

## 整体架构

![long-novel-writer architecture](docs/architecture-overview.png)

可编辑 Mermaid 源文件：[`docs/architecture-overview.mmd`](docs/architecture-overview.mmd)

## 仓库结构

```text
skill/long-novel-writer/   可安装技能本体
tests/                     单元与集成测试
evals/                     任务级评测规范与证据
tools/                     仓库验证、安装和评测工具
research/                  上游研究与许可证边界
.github/workflows/         跨平台 CI
```

## 本地验证

```powershell
npm run verify
```

该命令依次执行 JavaScript 语法检查、技能结构检查、单元/集成测试和可复现评测。

发布门禁比普通验证更严格：

```powershell
npm run release:check
```

## 安装

先验证，再执行带哈希核对、旧版备份与失败回滚的安装：

```powershell
npm run install:skill
# 或同步到显式目录
node tools/sync-install.mjs --target D:\path\to\skills\long-novel-writer
```

默认目标为 `~/.codex/skills/long-novel-writer`。替换前的版本保留为同级时间戳备份目录。

## 快速使用

```powershell
$skill = "<仓库>\skill\long-novel-writer"

# 新建小说工程
node "$skill\scripts\init-project.js" --root . --title "雾港来信" --genre "悬疑" --target-words 800000

# 扫榜：先 dry-run 核对请求，不消耗 Firecrawl 额度
node "$skill\scripts\rank-scan.js" --platform fanqie --dry-run

# 逐章事务：begin 自动打包上下文并过前门；写作和状态提交后由 finish 验收
node "$skill\scripts\chapter-transaction.js" begin .\雾港来信 --chapter 1 --query "林舟 账本" --min-chars 2500 --max-chars 3500
node "$skill\scripts\chapter-transaction.js" finish .\雾港来信 --chapter 1
```

## 已知限制

- Firecrawl 云端实时扫榜需要本地配置 `FIRECRAWL_API_KEY`；自部署实例可配置 `FIRECRAWL_API_URL`。
- 没有凭证时只执行请求预览与离线导入测试，不伪造实时榜单结果。
- 调研样本包含 AGPL 与许可证未声明项目；本仓库只提炼架构机制，不复制其代码或文本。
- 平台 DOM 会变化；CI 使用固定夹具和本地 Firecrawl mock，不消耗云端额度，也不声称持续监控线上榜单。
- `ciweimao` 的稳定官方榜单入口尚未核验，必须显式传入 URL。
- 已记录独立新 Agent 的前三章盲读：`evals/field-tests/2026-08-08-forward-panel.md`；三名读者均选择继续，综合 readerExperience=8.0。

## 许可证

MIT。第三方项目及服务保持各自许可证与使用条款。

## Durable unattended run

A one-start execution is available through the bundled bridge. It records every Agent prompt/transcript and resumes from the last committed chapter:

```powershell
node "$skill\scripts\autopilot-runner.js" start .\BOOK
node "$skill\scripts\autopilot-runner.js" run .\BOOK --model "MODEL" --quiet
node "$skill\scripts\autopilot-runner.js" status .\BOOK
```

Use `--max-chapters N` for a bounded test slice. The runner pauses at the three-chapter cold-reader gate, retries bounded failures, and stores evidence under the book directory.

## Fanqie mobile manuscript format

Each chapter is checked by `scripts/format-gate.js` before commit. The gate keeps one chapter title, single blank lines, short mobile-first paragraphs, purposeful standalone dialogue, and plain publishable prose. Markdown tables/lists/code fences, outline headings, crowded paragraphs, repeated timeline openers, and low-action subject chains are recorded as format findings; hard findings send the current chapter back to rewrite and are preserved in `analysis/autopilot-qa-chXXXX.json`.

The same gate rejects generic end teasers such as “the real test has just
begun.” A Fanqie chapter hook must leave a concrete actor, object, result,
decision, place, deadline, or risk that the reader can inherit into the next
chapter.

```powershell
node "$skill\scripts\format-gate.js" .\BOOK\manuscript --json
```


## Durable story context

Every initialized project includes an author-intent compass, a current-focus file, a derived foreshadowing index, and chapter-memory capsules. The transaction flow rebuilds the index and priority context before drafting, then captures a hash-bound memory capsule on commit.

```powershell
node "$skill\scripts\foreshadowing-index.js" .\BOOK --chapter 12 --write
node "$skill\scripts\chapter-memory.js" validate .\BOOK --chapter 12
```

The context-pack manifest reports critical, recent, warm, and cold-retrieved budget use. See `skill/long-novel-writer/references/operations/long-context-loop.md`.


## Chapter contracts and automatic repair

Before every chapter transaction, the skill creates a hash-backed chapter card containing the beat, current character knowledge boundary, due foreshadowing, a three-scene delivery contract, and seven exact obligations (goal, obstacle, turn, cost, information, emotion, and end hook). A failed deterministic quality gate triggers up to `chapter_revision_passes` bounded Draft B/C repair calls inside the same transaction; every repair prompt, transcript, and final QA result remains in the book directory.

```powershell
node "$skill\scripts\chapter-card.js" build .\BOOK --chapter 12
node "$skill\scripts\chapter-card.js" validate .\BOOK --chapter 12
```

## Evidence-bound chapter reader review

Each Draft A now receives an independent cold-reader report before it can
commit. The report scores clarity, continuation, Fanqie fit, character agency,
and chapter payoff. Every reported issue must quote the manuscript verbatim;
the validator records the reviewed manuscript SHA-256 and rejects fabricated
evidence. It additionally requires literal proof that the prose delivers the
chapter's goal, obstacle, turn, visible mini-payoff, and next-reading hook; an
absent leg blocks a `pass` verdict. A threat deferred to the next chapter does
not count as this chapter's payoff. Cold-reader schema `1.6` also checks every
exact obligation from the binding chapter card against a literal passage, so a
chapter with a generic action scene cannot silently replace its assigned beat.
A weak score, critical issue, missing scene leg, failed chapter obligation, or
`revise` verdict enters the existing bounded Draft B/C repair loop and receives
a fresh review round.

```powershell
node "$skill\scripts\chapter-reader-review.js" validate .\BOOK --chapter 12 --file .\BOOK\analysis\chapter-reader-review-ch0012-r01.json
```

The default `settings/agent-runner.json` keeps this loop enabled with a minimum
score of 7. All report rounds are retained under `analysis/` and included by the
project audit manifest.

Repair candidates are never blindly promoted. Draft A and every revision are
snapshotted under `state/chapter-revisions/`; a deterministic brief records what
must remain intact and the exact evidence to repair. The runner keeps a rewrite
only when it reduces deterministic or cold-reader debt, or raises the
reader-score by at least 0.25. A plateau restores the stronger prior draft and
starts a fresh bounded production attempt.

## Post-review retry recovery

Once a chapter has passed deterministic checks and cold reading, the runner
writes a short-lived, hash-bound `state/post-review-checkpoint.json`. A
transient fact-extraction failure resumes the accepted draft and reader receipt
instead of generating a second version of the chapter. This reuse is
fail-closed: a changed manuscript, chapter card, transaction, report, or
acceptance status invalidates the checkpoint and takes the normal fresh-draft
path.

## Evidence-bound chapter facts

After an accepted chapter passes cold-read and transaction gates, a separate
extractor writes literal-evidence facts to `analysis/chapter-facts-chXXXX.json`.
The validator archives its normalized, hash-bound copy under
`state/fact-ledger/ch-XXXX.json`; recent entries feed the next chapter's context
pack. The ledger covers events, character/location/resource state, knowledge,
relationships, timeline, and opened/closed hooks while keeping planned outline
material outside the fact layer.

```powershell
node "$skill\scripts\chapter-facts.js" validate .\BOOK --chapter 12 --file .\BOOK\analysis\chapter-facts-ch0012.json
```

## Evidence-bound foreshadowing progress

The planned foreshadowing ledger remains an outline asset. After chapter facts
are accepted, the runner derives `state/foreshadowing-progress.json` from
literal `hook_open` / `hook_closed` evidence. A payoff scheduled for the
accepted chapter must have an on-page closure fact; missing setups and
reinforcements remain visible warnings for the following chapter. The progress
file enters the critical context tier and rolls back together with the fact
ledger if finalization fails.

```powershell
node "$skill\scripts\foreshadowing-reconcile.js" update .\BOOK --chapter 12
```

## Reader feedback rule loop

`state/feedback-ledger.md` retains the original reader wording and the chosen
repair action. At every new chapter transaction, the runner compiles active,
actionable rows into `state/feedback-rules.json`, which enters the critical
context tier. When a rule reaches its verification chapter, the cold reader
must return one literal-evidence pass/fail/not-applicable check; a failure keeps
the chapter inside the existing repair loop.

```powershell
node "$skill\scripts\feedback-rules.js" compile .\BOOK
```

## Evidence-backed style contract

OpenWrite's useful source-pack idea is implemented here without importing its
application runtime: evidence stays in the project vault, while only adopted,
reusable style signals become a compact chapter contract. Fill
`evidence/derivations/style-signals.md`; a transaction compiles it to
`state/style-contract.json`, freezes its hash, puts it in the critical context
tier, and passes it to draft, repair, and cold-reader stages. Each applicable
signal receives one literal-evidence review check; a failed signal remains
revision debt. Source-specific names, plot points, and wording are excluded
from the contract.

```powershell
node "$skill\scripts\style-contract.js" compile .\BOOK
```

## Character agency contract

For every important character, the project can adopt a current goal, pressure,
knowledge boundary, voice/action rule, and prohibited shortcut in
`evidence/derivations/character-contracts.md`. The transaction compiles and
locks `state/character-contracts.json`; it joins the critical context pack and
the cold reader reviews each applicable on-page character using literal prose
evidence. A character who acts with impossible knowledge, loses motivation, or
speaks outside the adopted profile creates revision debt in the same chapter.

```powershell
node "$skill\scripts\character-contract.js" compile .\BOOK
```

## Cross-chapter pacing health

The runner preserves a hash-bound `state/pacing-ledger.json` from accepted
cold-reader reports. It records the actual pressure, primary hook type, and
visible-payoff type per chapter, then warns the next chapter against repeated
hook/reward shapes, sustained high pressure, or a missing release beat. This
advises the next Fanqie chapter while preserving its approved beat and Canon.

```powershell
node "$skill\scripts\pacing-ledger.js" audit .\BOOK
```

## Cross-chapter quality trajectory

Openwrite's rolling-plan idea is distilled into a file-first diagnostic loop:
only final accepted cold-reader reports whose manuscript hashes still match are
placed in `state/quality-trend-ledger.json`. The companion
`state/quality-guidance.json` names the current weak reader-experience
dimension, weakest chapter, and a meaningful decline or repeated low-score
streak. The next chapter transaction freezes the brief into its context and
chapter card; it advises craft execution but cannot change the approved beat or
Canon.

```powershell
node "$skill\scripts\quality-trend-ledger.js" audit .\BOOK
node "$skill\scripts\quality-trend-ledger.js" update .\BOOK --chapter 13
```

## Repair-debt attribution

The final accepted revision no longer hides initial-draft failures. The new
`state/repair-debt-ledger.json` aggregates all saved cold-reader rounds and
classifies repeated repair debt, scene-contract delivery failures, diagnostic
drift, and exhausted revision budgets. Its compact
`state/repair-debt-guidance.json` is refreshed on commit and failed attempts,
then frozen into the next transaction so the writer prevents a known failure
instead of repeatedly applying generic language repair.

```powershell
node "$skill\scripts\repair-debt-ledger.js" audit .\BOOK
node "$skill\scripts\repair-debt-ledger.js" update .\BOOK --chapter 13
```
