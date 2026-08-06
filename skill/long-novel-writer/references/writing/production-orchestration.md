# 长篇生产编排

用于连续生成、多章批量、跨会话恢复和百万字项目。核心原则：模型负责提出和起草，脚本负责放行、落盘、校验与追责。

## 逐章事务

每章只允许一个活动事务：

```powershell
node scripts/chapter-transaction.js begin <项目目录> --chapter 42 --query "人物 道具 伏笔" --min-chars 2500 --max-chars 3500
# 写正文，并更新 project-state/current-state/人物/时间线/钩子/伏笔
node scripts/chapter-transaction.js finish <项目目录> --chapter 42
```

`begin` 自动重建上下文包、执行写前门、锁定 Canon 哈希与章长区间。`finish` 执行写后门、检查状态提交、记录正文哈希，并把结果写入 `state/production-ledger.jsonl`。失败后仍停留在同一章，修复后重跑 `finish`。

查看或中止：

```powershell
node scripts/chapter-transaction.js status <项目目录>
node scripts/chapter-transaction.js abort <项目目录> --reason "章纲已撤回，重新策划"
```

## Canon 权威链

优先级：当前明确指令 → `settings/` → 已确认大纲 → 已定稿正文 → `state/`。聊天记忆只用于导航，不是事实源。

事务开始后，`settings/*.md`、全书/卷级大纲和章纲视为锁定 Canon。若本章确需修改这些文件，先确认变化，再使用：

```powershell
node scripts/chapter-transaction.js finish <项目目录> --chapter 42 --approve-canon --reason "用户确认：本章揭示修订能力代价"
```

局部措辞、状态推进和伏笔状态更新不等于 Canon 改写；改变因果、人物动机/知情范围、世界规则、时间顺序、卷级承诺或结局含义属于 Canon 变更。

## 上下文分层

写作上下文至少包含：

1. 全局契约、文体和硬规则；
2. 当前卷目标与本章九字段章拍；
3. 当前人物、物品、地点、时间、知情范围；
4. 最近 2–3 章及上一章结尾；
5. 按人物/道具/伏笔查询召回的较早章节；
6. 下一章章拍，用于避免把后续承诺提前耗尽。

不要把全书正文无差别塞入上下文。检索只负责召回候选，事实仍需回到源文件核验。

## 批次与检查点

- 30 万字以上的新项目先产出黄金三章试读包；真人冷读通过前，不得开始第 4 章。用 `scripts/pilot-review.js` 记录 approve/reject，模型不得自批。
- 正文因果链保持顺序写作；可并行的是审校、事实抽取和不同评审视角。
- 单批默认 1–3 章；稳定后最多 5 章，限制错误传播半径。
- 第 6 章做第一次“新鲜度衰减”检查；以后每 10 章检查一次句式、开场、章尾、场景类型和信息传递方式的重复。
- 每 10 章执行一次冷读：只给正文与读者契约，不给创作解释，让评审标出困惑、拖沓和未兑现期待。
- 每卷执行一次结构评审：读者承诺、角色弧、伏笔/问题/回报、节奏曲线、Canon 冲突。

## 质量债务与停止规则

把每次门禁失败、Canon 变更、人工复核线索和返工原因记录在生产账本或 QA 报告。相同错误出现两次就转成确定性检查或明确规则。

单章最多重试 5 次。达到上限仍失败时暂停批量生产，输出：失败维度、证据、已尝试修复、建议决策。修订连续两轮没有改善时停止机械重写，转为人工判断或结构调整。

真人出现“看不懂、乱、不舒服、不像目标平台”等反馈时，视为试读门失败，不用机械分数反驳。记录 rejection，冻结续写；先判断是卖点错位、章拍越界、概念过载、说明书对白还是情绪回报缺失，再重做试读包。

## 社区经验来源

- `NousResearch/autonovel`：逐章评分、最多 5 次重试、keep/discard 实验日志、质量债务、多角色读者评审。
- `YILING0013/AI_NovelGenerator`：定稿后同步摘要、角色状态、剧情线与检索库。
- `RhythmicWave/NovelForge`：Schema-first、受控字数预算、结构化审核卡、工作流中断恢复。
- `danjdewhurst/story-skills`：场景级状态、问题/承诺独立登记、索引与反向链接维护。
- `hottweelz/writing-template-for-ai`：Canon 变更必须显式审计，不让“润色”静默改变故事事实。
