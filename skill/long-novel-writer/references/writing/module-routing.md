# 写作模块路由

本文件把“先诊断、再调用专项模块”固化为可执行路由。不要把所有参考资料一次性塞进上下文；先定位故障层，再读取一个主模块和一个校验模块。

## 诊断顺序

1. **读者层**：普通读者是否能复述主角要什么、眼前麻烦和本章得失？
2. **承诺层**：书名、简介、题材和前 3 章是否兑现同一个核心回报？
3. **结构层**：本章是否有目标、阻力、选择、不可逆变化和章尾钩子？
4. **Canon 层**：时间、地点、知情范围、能力成本、伤势和伏笔是否有证据？
5. **表达层**：段落是否在行动、对话、观察、判断和关系变化之间形成可读节奏？

## 症状到模块

| 症状 | 先读取 | 再校验 | 交付证据 |
|---|---|---|---|
| 看不懂、术语堆积、解释像说明书 | `opening-design.md`、`platform-pilot-and-readability.md` | `reader-metrics.md` | 一句口语复述、概念清单、开头动作位置 |
| 章节像流水账、主角没有选择 | `plot-core-methods.md`、`outline-conflict.md` | `hooks-chapter.md` | 目标—阻力—选择—代价链 |
| 章尾不想追、高潮提前透支 | `hooks-chapter.md`、`hooks-suspense.md` | `reader-contract-and-progression.md` | 本章兑现、延期承诺、下一章问题 |
| 人物说话同声同气、对话尴尬 | `dialogue-mastery.md` | `reader-metrics.md` | 每轮对话的目的、潜台词、地位变化 |
| 设定互相打架、伏笔失踪 | `context-and-gates.md`、`artifact-protocols.md` | `quality-checklist.md` | 事实来源章节、冲突项、修复动作 |
| 读起来像 AI、空泛总结多 | `writing-craft.md`、`style-combat-rules.md` | `references/deslop/` 下对应门 | 原句—改句—保留的剧情事实 |
| 连续章节重复同一套升级 | `genre-core-mechanics.md`、`outline-rhythm.md` | `check-ai-patterns.js` | 重复回合证据与变体方案 |
| 用户反馈后仍反复犯错 | `state/handoff-current.md`、`state/feedback-ledger.md` | `pilot-review.js` | 反馈原句、规则化动作、复验结果 |

## 路由约束

- 每次写作最多加载 1 个主模块、1 个校验模块和当前项目事实；需要第三个模块时说明它解决哪个证据缺口。
- 先修读者层和承诺层，再修句子层；不得用“去 AI 味”掩盖看不懂、拖沓或平台错位。
- 专项模块只给方法，不覆盖项目的 `settings/`、`outline/`、`state/` 事实；项目文件优先。
- 同一问题连续出现两次，写入 `state/feedback-ledger.md` 并增加确定性测试或门禁，而不是继续提醒。
