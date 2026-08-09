# 证据化风格合约

## 目的

把扫榜、拆书、读者反馈或作者样稿中得到的**可复用写法**变成当前书可执行、可复核的约束；不把某部作品的专名、情节、角色口头禅和原句带入正文。

这套分层采用 OpenWrite 的有效思路，但以本技能的文件优先事务为准：

1. 通用技法与平台格式留在 `references/` 和 `settings/platform-contract.md`；
2. 原始来源、摘录和拆解证据留在 `evidence/`；
3. 只有项目主动采纳的抽象信号进入 `state/style-contract.json`；
4. 章节冷读必须逐项用本章原文复验，失败即回到当前事务修订。

## 输入表

填写 `evidence/derivations/style-signals.md`：

| ID | 维度 | 可复用信号 | 证据来源 | 适用范围 | 状态 |
|---|---|---|---|---|---|
| STYLE-OPEN | 叙事 | 开篇先给具体动作和阻力，再补最少必要背景 | `evidence/sources/source-index.md#scan-2026-08-09` | 开篇 | 采纳 |
| STYLE-DIALOGUE | 对话 | 冲突信息优先让角色在对话中争夺，不用作者总结代替 | `analysis/breakdown.md#dialogue` | 全书 | 采纳 |

- 支持维度：叙事、语言、节奏、对话、情感、格式、负面约束。
- 支持范围：`全书`、`开篇`（第 1–3 章）、`chapter:12`、`chapter:12-15`。
- 只有 `采纳` / `已采纳` / `启用` / `adopted` / `active` 状态参与编译。
- 信号描述写“方法与效果”，不写来源作品里的角色、设定、剧情或句子。

## 执行与门禁

```powershell
node scripts/style-contract.js compile <项目目录>
node scripts/chapter-transaction.js begin <项目目录> --chapter <N>
```

`begin` 会自动重编译，并在事务内冻结 `state/style-contract.json` 的哈希。它进入关键上下文；初稿、修订稿和独立冷读读取同一份合约。冷读 JSON 的 `style_signal_checks` 必须对当前章到期的每条信号给出一个 `pass`、`fail` 或 `not_applicable` 结果；`fail` 必须附正文原句并使章节继续修订。

检查派生关系：

```powershell
node scripts/project-audit.js <项目目录> --write-manifest
```

原始证据依旧是判断依据；`state/style-contract.json` 只是可重建的执行缓存。
