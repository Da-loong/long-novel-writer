# Crawl4AI 扫榜运行契约

扫榜适配器固定走 `scripts/rank-scan.js --adapter crawl4ai --project <PROJECT>`，底层为本地 Crawl4AI + Playwright；Firecrawl 只保留为历史兼容代码，不是默认路径。

## 安装与修复

在 `D:\project\crawl4ai-scanner` 执行：

```powershell
$env:PIP_REQUIRE_HASHES='0'
python -m pip install --upgrade --no-cache-dir -r .\requirements.txt
python -m playwright install chromium
```

若 `crawl4ai-setup` 不在 PATH，直接使用 `setup.ps1`；脚本会从 Python 的 scripts 目录定位入口，并保留 Playwright 可用的 SSR 回退。

## 证据规则

1. 每个榜单页面保存原始 HTML、采集时间、页面 URL、解析模式和警告到 `evidence/snapshots/`。
2. 采集少于 10 本、标题仍含 PUA 字符、字体依赖/资产缺失时，`preproduction-gate` 停止标杆池链路；低置信字形作为带计数和样本的警告保留，不把搜索摘要或模型猜测写入榜单。
3. 已登录 Chrome 可通过 `settings/market-sources.json` 的 `cdp` 与 `persistent_dir` 字段接入；连接失败会记录原因并使用官方 SSR，不静默伪造动态结果。
4. 所有选书必须回指 `analysis/ranking-snapshot.json` 的条目和证据文件，之后才进入 10–20 本标杆池。

## 验证

```powershell
node scripts/rank-scan.js --adapter crawl4ai --project <PROJECT>
node scripts/deep-breakdown-gate.js <PROJECT>
```
