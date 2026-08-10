# 证据仓与监管工作流

## 项目资料分层

- `evidence/sources/`：原始来源、URL、采集时间、来源等级、原文摘录。
- `evidence/snapshots/`：不可变扫描快照；每次运行新建日期文件。
- `evidence/derivations/`：候选矩阵、拆书推导、选题决策、大纲依赖。
- `evidence/platform-metrics/`：平台导出的原始 CSV/JSON 副本；`state/platform-metrics.json` 只保存其 SHA-256 与规范化行。
- `evidence/lineage/manifest.json`：文件哈希和依赖关系。
- `supervision/dashboard.md`：当前阶段、生产放行、真人结论、允许/禁止动作。
- `supervision/review-queue.md`：下一项人工复核和验收条件。
- `supervision/decision-log.md`：每次选题、冻结、重写、放行的原因。
- `supervision/stop-conditions.md`：作文感、看不懂、追读欲低等硬停止条件。

## 每次执行

1. 运行 `node scripts/project-audit.js <项目> --write-manifest`。
2. 先看 `supervision/dashboard.md`，确认阶段和放行状态。
3. 选题、拆书、大纲、章节各保存一个带日期的派生文件。
4. 正文写入前，检查来源与决策的依赖；正文重写产生新文件或新版本记录。
5. 真人反馈优先于自动指标；反馈写入 `analysis/reader-rejection-YYYY-MM-DD.md` 和 `state/feedback-ledger.md`。
6. 反馈触发停止条件时，把 `state/autopilot.json` 设为 paused，并把 `state/autopilot-pilot.json` 设为 rejected。
7. 真实发布数据通过 `node scripts/platform-feedback.js ingest <项目> --input <导出文件>` 回流；缺失字段保持 null，不用模型补齐。发布队列已有成功条目而没有指标证据时，`production-readiness.js` 保持未就绪。

## 监管命令

```powershell
node scripts/project-audit.js <项目> --write-manifest
node scripts/autopilot.js status <项目>
node scripts/handoff.js <项目>
```

`handoff-current.md` 只做交接摘要；完整证据以 `evidence/` 和 `supervision/` 为准。
