# Firecrawl 榜单扫描

## 定位

Firecrawl 用于把公开榜单页转为带证据的结构化快照，不直接等同于趋势结论。在线抓取与离线导入共用 `scripts/rank-scan.js`，输出同一版本化 schema。

- Firecrawl 核心仓库采用 AGPL-3.0，可自托管；云服务按额度计费，不把“开源”理解为云端不限量。
- 云端设置 `FIRECRAWL_API_KEY`；自托管设置 `FIRECRAWL_API_URL`。
- 默认调用 v2 `scrape`。自托管网关若已包含 `/v1` 或 `/v2`，脚本直接在其后追加 `/scrape`。
- 官方资料：`https://github.com/firecrawl/firecrawl`、`https://docs.firecrawl.dev/api-reference/endpoint/scrape`、`https://github.com/firecrawl/firecrawl/blob/main/SELF_HOST.md`。

## 两种输入

### 离线导出

```powershell
node scripts/rank-scan.js --platform qimao --input ranking.html --out snapshot.json
```

支持 JSON、JSONL、HTML `<table>`、CSV、TSV、Markdown pipe。字段归一为：

```json
{
  "rank": 1,
  "title": "作品名",
  "author": "作者",
  "genre": "分类",
  "subgenre": "二级分类",
  "words": 120000,
  "status": "连载",
  "blurb": "简介",
  "tags": ["标签"],
  "source": "来源",
  "captured_at": "ISO-8601"
}
```

### 在线抓取

```powershell
$env:FIRECRAWL_API_KEY='<TOKEN>'
node scripts/rank-scan.js --platform fanqie --out snapshot.json --evidence firecrawl-response.json
```

`--out` 保存归一快照；`--evidence` 保存时间、接口和原始响应。两者必须成对进入趋势证据目录。提交公开仓库前检查证据文件不含密钥、Cookie 或私人页面内容。

## 平台配置

平台 URL 与必要交互位于 `assets/platforms/*.json`。仅把已人工核验的官方入口写入默认配置：

| ID | 默认入口 | 特性 |
|---|---|---|
| `fanqie` | `https://fanqienovel.com/rank/all` | 动态渲染，默认等待 |
| `qimao` | `https://www.qimao.com/paihang/` | 服务端内容较完整 |
| `qidian` | `https://www.qidian.com/rank/` | 动态渲染，默认等待 |
| `jjwxc` | `https://wap.jjwxc.net/rank/index` | 移动榜单入口 |
| `ciweimao` | 无 | 入口未稳定核验，必须显式传 `--url` |

网址失效时先用浏览器核验官方入口和榜单口径，再改配置；不要把搜索结果页或第三方转载设为默认源。

## 证据门禁

在写“当前趋势”前检查：

1. `captured_at` 位于用户要求的时间窗内。
2. `source_url` 是官方页面，`platform` 与请求平台一致。
3. `sample_size > 0`，条目包含可识别排名和书名。
4. 记录榜单类别、频道、性别向、统计周期；页面未给出的口径标为未知。
5. 报告重复排名、重复书名和字段缺失，不静默去重。
6. 至少两个独立快照才讨论变化；单次截面只描述构成。
7. 把事实、推断、选题建议分栏，建议不得冒充平台数据。

脚本返回 `EMPTY_RANKING`、`FIRECRAWL_REQUEST_FAILED` 或配置错误时，保留错误和请求元数据，修复源或交互后重跑。不要用模型常识填补空结果。
