# Autopilot 网文写作资料校准

日期：2026-08-07
范围：公开论文、开源实现、番茄官方作家课堂与推荐区页面
目标：把“自动从扫榜写到完结”从提示词愿望改成可审计的流水线。

## 资料结论

| 来源 | 公开证据 | 对本 Skill 的改动 |
|---|---|---|
| StoryWriter（2025） | 事件图、章节计划、按当前事件压缩历史；长篇难点是连贯性与叙事复杂度 | 增加事件/目标锚点，写作上下文分为 CORE、ARCHIVAL、RECALL |
| ConStory-Bench（2026） | 矛盾集中在事实与时间；中段更容易出错；判断要有原文证据链 | 增加 `evidence-audit.js`，要求 finding 引用源文件与原文片段；第 10/20/30 章加密复核 |
| LongWeave（2025） | 用 Target-Anchored Evaluation 把任务目标、材料和可验证锚点绑定 | 增加 `target-anchored-evaluation.md`，把书名承诺、卷目标、章目标绑定到正文证据 |
| autonovel | modify→evaluate→keep/discard；Canon、outline、characters、world、voice 分层；机械免疫系统 + 独立 LLM judge | 保留现有事务/Canon，加入候选保留规则、分层记忆和双审计 |
| AuthorAgent | 证据链矛盾检测、角色声音审查、judge→diagnose→revise→re-judge、合成读者面板、睡眠时记忆巩固 | 自动盲评不再只看总分；反馈转成持久规则，章节/角色/全书分层审查 |
| 番茄官方作家课堂 | 官方课程直接覆盖稳定更新、黄金节奏、剧情主线、流水账升级、人物立体、说明书感、读者划走、作品完结 | 新增平台合同检查：即时回报、节奏、主线、动作/场景、读者停留和完结回收 |
| 番茄官方作家专区 | 提供推荐验证期、低质治理、定时发布、作品完结和作品标签等入口 | 扫榜报告记录“推荐验证/低质治理/完结”页面的采集时间，不把传闻数值当硬规则 |

## 采用与舍弃

### 采用

1. **事件级计划**：章纲不是一句剧情摘要，而是事件、参与角色、因果边、目标、代价和兑现证据。
2. **目标锚点评审**：每个承诺必须绑定正文中的可核验位置。
3. **证据链矛盾审计**：任何高严重度判断都要有 `path + quote`，并能回到源文件。
4. **中段加密复核**：第 10、20、30 章及每卷中点做时间线、角色和世界规则专项审计。
5. **自动返工保留制**：候选版本只有在分数不下降且关键问题减少时才保留。
6. **平台页面分层**：官方页面做硬事实，作者经验与第三方文章只作为待验证启发。

### 舍弃

- 不把第三方文章声称的固定追读率、书架率或验证天数写成永久规则；平台页面已持续更新。
- 不把“模型自评 8 分”当读者事实；分数必须带读者报告、目标锚点和原文证据。
- 不把单一全书摘要当长期记忆；原文、结构化状态和检索片段分层保存。

## 资料链接

- https://arxiv.org/abs/2506.16445
- https://arxiv.org/abs/2603.05890
- https://aclanthology.org/2025.findings-emnlp.549/
- https://github.com/NousResearch/autonovel
- https://github.com/Ckokoski/AuthorAgent
- https://fanqienovel.com/writer/zone/tutorial?tab=1
- https://fanqienovel.com/writer/zone/
- https://fanqienovel.com/writer/zone/article/7659317147297923134
