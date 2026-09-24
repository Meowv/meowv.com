# Wallpapers Crawler

采集公开壁纸接口的元数据和 CDN 地址，存入本地 SQLite；默认不下载图片或视频。它为 [Studio](../studio/README.md) 生成加密壁纸目录，也为 [livewall](../livewall/README.md) 导出明文清单。采集器本身不构建或部署站点。

修改边界与验证要求见 [AGENTS.md](./AGENTS.md)；仓库脚本见 [根 README](../README.md)。

## 结构与环境

| 路径 | 用途 |
| --- | --- |
| `src/wallpapers/cli.py` | 命令入口与参数 |
| `src/wallpapers/pipeline.py`、`sources/` | 抓取流程与公开接口适配 |
| `src/wallpapers/db.py` | SQLite 表结构、迁移和查询 |
| `src/wallpapers/publish.py`、`export.py` | Studio 目录与 livewall 清单 |
| `tests/` | 数据库、抓取与导出测试 |
| `wallpapers.db` | 默认本地数据库，不提交 Git |

需要 Python 3.12 或更高版本；运行时只用标准库。在 `wallpapers/` 目录可直接运行，无需安装：

```bash
PYTHONPATH=src python3 -m wallpapers crawl
PYTHONPATH=src python3 -m wallpapers stats
PYTHONPATH=src python3 -m wallpapers check
```

也可用 `python3 -m pip install -e .` 安装为 `wallpapers` 命令，或从仓库根目录使用 `./run.sh w [crawl|publish|stats|check] ...`；`run.sh w` 默认执行 `crawl`。完整参数以 `PYTHONPATH=src python3 -m wallpapers <命令> --help` 为准。`--db PATH` 可放在主命令或子命令后，默认是 `wallpapers.db`。

## 数据范围与抓取

`crawl` 默认抓取 `desktop` / `mobile` 的 `dynamic` / `static` 内容，按设备、内容、分类或关键词缩小范围。`--category` 和 `--keyword` 可重复传入；指定关键词时走搜索接口，不再按分类分页。用 `--max-pages N` 限制每个作用域的请求页数。

| 模式 | 行为 |
| --- | --- |
| `incremental`（默认） | 从第一页开始，遇到已知且无更新的页面时停止；新作用域会遍历完整分页 |
| `quick` | 每个作用域只抓第一页，不更新正式游标 |
| `full` | 遍历分页；未指定分类、关键词或页数上限时还会校对失踪资源，两次完整校对未见后标记为 `inactive` |

例如只抓电脑动态壁纸的「风景」分类：

```bash
PYTHONPATH=src python3 -m wallpapers crawl --device desktop --content dynamic --category 风景 --max-pages 2
```

`stats` 按设备和内容类型统计数据库条目。`check` 对已保存的 CDN 地址逐条发 `HEAD` 请求，更新可访问状态，不下载媒体。采集器只访问公开接口，不登录或绕过付费与权限校验。

数据库包含壁纸、资源、分类、关键词及其关系表，并保存抓取任务和增量游标。字段与迁移以 [`db.py`](src/wallpapers/db.py) 为准；时间字段为 UTC ISO 8601 文本，SQLite 布尔值为 `0` / `1`。

## 生成 Studio 发布目录

在 `wallpapers/` 目录运行：

```bash
PYTHONPATH=src python3 -m wallpapers publish --db wallpapers.db --output-dir ../studio/public/data
```

`publish` 输出四组版本化 JSON 目录、首屏 bootstrap 和 `wallpapers.catalog.json` manifest，供 Studio 壁纸页使用。此命令只生成**加密前**的临时 JSON。要得到可部署目录，从仓库根目录运行：

```bash
./build.sh wallpapers
# 或在构建 Studio 前生成
./build.sh studio --with-wallpapers
```

根脚本会生成 Studio 目录、加密为版本化 `.bin`，同时导出并签名 livewall 清单。`./build.sh wallpapers` 不构建 Studio；如果 `build/studio.meowv.com/` 已存在，还会同步数据产物。普通 `./build.sh studio` 不读取壁纸数据库。生成目录均不提交 Git。

## 导出 livewall 壁纸清单

`export-livewall` 默认从数据库导出「桌面 + 动态」的明文清单到 `../studio/public/data/livewall/`：

```bash
PYTHONPATH=src python3 -m wallpapers export-livewall
PYTHONPATH=src python3 -m wallpapers export-livewall --device mobile --content dynamic --default-category 风景
```

| 文件 | 内容 |
| --- | --- |
| `catalog.json` | 分类、默认分类、切片文件名和 SHA-256 摘要；不含壁纸条目 |
| `all.json` | 按壁纸 ID 去重的全部条目；无条目时不生成 |
| `category.<一级分类 id>.json` | 每个有内容的一级分类及其子树各一份；空分类只列在索引中 |
| `catalog.json.sig` | 索引的 Ed25519 签名，由根 `build.sh` 调用签名工具生成 |

导出只保留活动记录和可用的 `video_preview` 播放地址；静态图地址从 `image` 资源读取，写为 `coverUrl`。同一壁纸可属于多个分类。`--output-dir` 指定的是 `livewall/` 的**父目录**；`--device`、`--content` 和 `--default-category` 可调整范围与默认分类。字段契约见 [`export.py`](src/wallpapers/export.py) 和 [客户端模型](../livewall/Sources/LiveWallCore/CatalogModel.swift)。

单独运行 `export-livewall` **不会签名**，而且会移除旧签名。客户端先校验 `catalog.json.sig`，再用签名索引中的摘要校验切片；索引和签名必须同批发布。手工导出后，可在 `wallpapers/` 目录签名并回验：

```bash
../livewall/tools/sign-version.swift sign --json ../studio/public/data/livewall/catalog.json --catalog
../livewall/tools/sign-version.swift verify --json ../studio/public/data/livewall/catalog.json
```

正常发布使用根 `build.sh`，它会完成切片摘要对账与签名。私钥位于仓库外，不写入源码或文档。

## 验证

修改代码时按 [AGENTS.md](./AGENTS.md) 的范围执行定向检查；测试依赖定义在 [`pyproject.toml`](pyproject.toml) 的 `test` extra 中。
