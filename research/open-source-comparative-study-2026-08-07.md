# 开源网文写作项目拆解与合并决策

日期：2026-08-07
范围：10 个用户指定仓库（去重后）
目标：只增强纯 Skill、项目文件和确定性脚本，不引入网站或桌面端。

## 一、仓库分型

| 项目 | 主要贡献 | 可吸收 | 不直接照搬 |
|---|---|---|---|
| AIxiezuo | 最小可运行生成器；章节 JSON 状态、世界设定、前文读取、状态回写、记忆压缩 | 每章快照、状态更新与记忆分片 | Web/LLM 封装；状态只覆盖主角和物品，无法承担长篇 Canon |
| Chinese-WebNovel-Skill | 模块路由、专项 README/tutorial/runtime、正反例、本地语料检索、黄金三章停靠、事实可溯源 | 主 skill 变薄；问题先分层再调用专项模块；Stage 0/1 停靠；事实回查 | 过多模块一次加载；并行 Agent 不是纯 Skill 必需品 |
| oh-story-claudecode | 扫榜→拆文→建档→长写→审查→去味的完整 Skill 族；样式配置与适配器部署 | 分阶段生命周期、样式档案、章纲不可越界、审查与写作分离 | Claude/OpenClaw/Codex 部署层、网站/封面功能 |
| writing-dna-skill | 20 篇完整语料、L1-L6 风格蒸馏、语言/结构/认知/视觉分层 | 风格从表面词频升级为节奏、结构和认知规则；小语料降级为格式演示 | 复刻特定作者腔；公开仓库存放未经授权原文 |
| sumeru | JSON 细纲、世界/角色/章节数据、断点恢复、审查三阶段、自动备份、修复计划 | 机器可读章纲；全局审查→逐章审查→统一修复；diff/backup/fix-plan | 并行子 Agent 和强制自动改稿在无人工判断时会放大错误 |
| human-writing | 材料优先、活人感、具体动作、拒绝空泛灌字数、虚构/非虚构分流 | 把“去 AI 味”前移到材料、说话位置、动作和判断；禁止解释腔 | 绝对化的标点/句式禁令；会伤害题材与作者偏好 |
| tianming-skill | Codex/Protocols/KB 分层；动态知识库覆盖静态模板；事实源裁定；输出封装 | 事实源优先级、缺字段先停、动态状态覆盖模板、协议化交付 | “宪法/Ω/法典”式过度复杂术语；不把提示词包装成真实安全机制 |
| fanqie-novel-skill | Truth Files、handoff、番茄向审计、对话比例、战斗审计、循环检测、进度面板 | 平台专属书规、handoff、对话/高潮/重复趋势监控、最小审计集 | 未经证实的签约/限流保证；静态阈值只能告警，不能代替读者判断 |
| jiangnan.skill | 用户反馈最高优先级、动态配方卡、条件启用检查、短交付停靠 | 反馈回执、偏好持久化、用户反向要求能关闭默认检查、短样先验收 | 单一作者风格的固定 DNA；不作为通用网文美学 |

## 二、共同逻辑的抽象

这些项目可归并为一条纯 Skill 流水线：

```text
输入/题材
  → 卖点与读者契约（能否成交）
  → 黄金三章试读（是否看得懂、愿意追）
  → 结构化世界/人物/章纲（机器可读）
  → 单章卡（目标/阻力/回报/钩子/禁止提前释放）
  → 正文生成（只加载必要事实）
  → 状态快照与 handoff
  → 结构审查（因果/人物/时间/信息边界/章拍漂移）
  → 表达审查（对白/节奏/AI腔/重复/平台调性）
  → 真人停靠或放行
```

现有技能之前把“工程完整”误当成“读者可读”。本轮把两者拆成两个状态：

- `engineering_pass`：字数、文件、状态、Canon、脚本检查通过；
- `reader_pass`：真人能复述、愿意点下一章、平台承诺兑现。

只有二者都通过，才允许百万字扩写。

## 三、对现有失败样本的反推

项目 `fanqie-million-trial/高武停电夜-我修好了人间防线` 的四章失败，不是缺少更多世界观文件，而是缺少以下硬约束：

1. **章拍边界**：第三章提前消耗第四章及后续教学内容。
2. **情绪先行**：技术名词在即时回报之前堆积。
3. **信息预算**：一章引入过多需记忆概念，解释段连续过长。
4. **平台成交**：书名承诺的高武/成长没有在前 3 章画面化兑现。
5. **真人停靠**：没有在第 3 章后先交给目标读者，而是直接开始第 4 章。

## 四、合并到本 Skill 的决策

### 保留并强化

- 现有 Canon 锁、chapter transaction、context pack、状态台账、Firecrawl 证据链。
- 新增 `pilot-review.js`，30 万字以上项目第 4 章前需要真人冷读放行。
- 新增模块化可读性规则：概念预算、解释段预算、章拍禁止提前释放、开头成交检查。
- 新增 `reader-metrics.js`：对话比例、开头行动延迟、连续解释段、弱章尾告警。
- 新增平台向 handoff/进度/循环审查的文档契约。

### 明确不做

- 不做网站、桌面端、封面生成、模型供应商管理。
- 不把“AI味检测 0 项”当成真人可读证明。
- 不把任何单一作者风格复制成默认文风。
- 不用自动润色覆盖结构性失败；结构失败必须回到卖点、章纲和场景任务。

## 五、引用仓库

- https://github.com/yefeng2renxing/AIxiezuo
- https://github.com/Tomsawyerhu/Chinese-WebNovel-Skill
- https://github.com/worldwonderer/oh-story-claudecode
- https://github.com/larashero3-dotcom/writing-dna-skill
- https://github.com/xindoo/sumeru
- https://github.com/KKKKhazix/human-writing
- https://github.com/zy-zmc/tianming-skill
- https://github.com/FlickeringLamp/ai-novelist
- https://github.com/dmlin7777777/jiangnan.skill
- https://github.com/304769384-png/fanqie-novel-skill
