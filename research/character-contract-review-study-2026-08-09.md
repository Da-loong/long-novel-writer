# 角色合约与角色视角审稿研究

- 检查日期：2026-08-09
- 主要来源：[AuthorAgent](https://github.com/Ckokoski/AuthorAgent)、[web-novel-writing-guidance-skill](https://github.com/HZ-KMNO/web-novel-writing-guidance-skill)、[howells/fiction](https://github.com/howells/fiction)
- 边界：本仓库只提炼独立的文件协议、校验逻辑、提示词与测试；未复制上游代码、UI、角色样例或文学文本。

## 证据

1. AuthorAgent 把“每个主要角色审查自己的对话”用于识别口吻偏移、超出已知信息和违背动机的行动，并让其进入专门修订流程。
2. web-novel-writing-guidance-skill 将人物自主目标、信息边界和修订门禁放在章节蓝图与 Draft A/B/C 顺序之前，强调先修结构与角色因果，再做去 AI 润色。
3. howells/fiction 将人物、章节复审、编辑和连续性拆为专职工序，并用结构化读者结果汇总长篇检查。

## 缺口

本技能已有角色状态、POV 信息边界、章卡与泛化的 `character_agency` 评分，但缺少逐个角色、逐章、带原文证据的目标/动机/知识/口吻复验。因此当章节看似完整时，角色仍可能变成只为推动大纲的工具人。

## 提炼与实现

| 机制 | 本技能实现 | 验证 |
|---|---|---|
| 角色目标、动机、知识、口吻契约 | `evidence/derivations/character-contracts.md` | 编译器拒绝空字段、重复角色和无效范围 |
| 采纳后才影响正文 | `scripts/character-contract.js` → `state/character-contracts.json` | 事务记录输出哈希，并锁定来源文件 |
| 逐角色视角复验 | 冷读 JSON 的 `character_contract_checks` | 每一位本章点名、在范围内的角色都需一个原文证据结果 |
| 修订闭环 | `fail` 令 `should_revise=true` | 单测覆盖漏检、失败和错误放行 |

## 番茄适配

该机制优先保护读者能立刻感知的角色驱动力：角色为什么此刻这么做、他凭什么知道、这句话像不像他、行动有没有代价。它服务快节奏章节的理解与追读，不增加长篇文学式人物独白负担。

## X 与 YouTube 扫描

本轮检索到的 X 和 YouTube 结果多为模型测评、通用写作技巧或缺少可核验实现的口播，未提炼规则。后续继续优先采用具备公开仓库、明确文件协议或可复现实验的材料。
