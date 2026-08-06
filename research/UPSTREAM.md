# 上游研究记录

核查日期：2026-08-06。以下仓库仅用于架构研究。

| 项目 | 核查提交 | 可吸收优势 | 许可证处理 |
|---|---|---|---|
| [Long-Novel-GPT](https://github.com/MaoXiaoYuZ/Long-Novel-GPT) | `107c31e` | 大纲→章节→正文、自上而下扩写、RAG 检索、修改正文时同步更新纲要 | 未发现明确许可证，只借鉴思想 |
| [novel-creator-skill](https://github.com/leenbj/novel-creator-skill) | `a327428` | 可执行章节门禁、五层记忆、事件冷却、节奏档位、故事图谱、模板与测试 | 未发现明确许可证，只借鉴思想 |
| [NovelWriter](https://github.com/EdwardAThomson/NovelWriter) | `163581a` | 多级审稿、检查点、多模型后端、类型配置、测试目录 | 未发现明确许可证，只借鉴思想 |
| [Firecrawl CLI](https://github.com/firecrawl/cli) | `c056079` | JSON Schema 提取、actions、结构化错误、凭证隔离、测试和跨平台 CLI | `package.json` 标注 ISC；只调用公开接口，不复制实现 |
| [agent-memory](https://github.com/axiomhq/agent-memory) | 在线核查 | 热/温/冷分层、信号→日志→合并→渐进披露 | 后续单独核查许可证后再决定实现边界 |

## 实测而非宣传

- `novel-creator-skill` 在 Windows 默认 GBK 控制台运行 52 项测试时出现 10 个编码错误。
- 设置 `PYTHONUTF8=1` 后 52 项全部通过。
- 结论：我们的 CI 必须同时覆盖 Windows 和 Linux，测试输出不得依赖控制台能否显示特殊符号。

## 独立实现方向

1. 用 JSON 状态模式与确定性校验器实现连续性门禁。
2. 用事件类型冷却和卷级节奏配额防止桥段重复。
3. 用固定检索索引与证据位置实现写前上下文，不声称不存在的语义记忆。
4. 用 Firecrawl API 适配层完成真实网页获取，离线解析与网络获取分离。
5. 每项能力建立失败用例、跨平台测试和可复现评测。
