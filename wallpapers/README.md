# Wallpapers Crawler

公开壁纸接口采集器。使用 Python 3.12 与 SQLite，默认只保存壁纸元数据以及图片、封面、视频预览的 CDN 地址，不下载媒体文件。

它是仓库里另外两个项目的**数据上游**，但三者不共享代码：`publish` 生成的目录供 [Meowv Studio](../studio/README.md) 的壁纸页使用（加密后部署），`export-livewall` 生成的清单供 [livewall](../livewall/README.md) 桌面客户端使用（明文，随 Studio 一起部署）。采集器本身不构建也不发布站点。

- 用途、CLI 参数、数据库表结构与发布说明 → 本文件
- 修改边界、约定与验证要求 → [`AGENTS.md`](./AGENTS.md)
- 仓库级概览与根目录脚本 → [`../README.md`](../README.md)、[`../AGENTS.md`](../AGENTS.md)

## 文档导航

- [快速开始](#快速开始)
- [生成 Studio 发布目录](#生成-studio-发布目录)
- [导出 livewall 壁纸清单](#导出-livewall-壁纸清单)
- [索引签名](#索引签名)
- [数据库表结构](#数据库表结构)
- [`crawl` 抓取命令](#crawl-抓取命令)
- [站点规划查询 SQL](#站点规划查询-sql)
- [`stats` / `check` 命令](#stats-统计命令)
- [验证](#验证)

## 目录结构

```text
wallpapers/
├─ pyproject.toml          项目元数据、[test] extra 与 wallpapers 命令入口
├─ src/wallpapers/
│  ├─ cli.py               CLI 参数与命令分发
│  ├─ config.py            数据源配置与运行常量
│  ├─ models.py            领域模型：CategoryData / AssetData / WallpaperData
│  ├─ normalize.py         接口返回值规范化（URL、尺寸、标签）
│  ├─ pipeline.py          抓取、增量游标与资源校验流程
│  ├─ db.py                SQLite 初始化、兼容迁移与查询
│  ├─ publish.py           生成 Studio catalog / bootstrap / manifest
│  ├─ export.py            导出 livewall 用的明文清单目录（索引 + 分类切片）
│  └─ sources/             接口适配器：base.py / desktop.py / mobile.py / manifest.py
├─ tests/                  数据库、规范化、抓取流程、接口适配与发布逻辑测试
└─ wallpapers.db           默认数据库（本地数据，不提交）
```

## 快速开始

在项目根目录（`wallpapers/`）执行。无需安装项目时，使用 `PYTHONPATH`：

```bash
PYTHONPATH=src python3 -m wallpapers crawl
PYTHONPATH=src python3 -m wallpapers stats
PYTHONPATH=src python3 -m wallpapers check
PYTHONPATH=src python3 -m wallpapers publish --db wallpapers.db --output-dir ../studio/public/data
```

也可以从仓库根目录通过 `run.sh` 调用。默认执行 `crawl`，参数会继续传递给壁纸 CLI：

```bash
../run.sh w
../run.sh wallpapers --device desktop --content dynamic
../run.sh w crawl --category 风景 --keyword 雨夜 --max-pages 2
../run.sh w publish
../run.sh w stats
../run.sh w check
```

也可以安装为本地命令：

```bash
python3 -m pip install -e .
wallpapers crawl
wallpapers stats
```

只做语法检查或运行测试时不需要安装为命令；在项目目录使用 `PYTHONPATH=src` 即可。测试依赖单独安装：

```bash
python3 -m pip install -e "[test]"
PYTHONPATH=src python3 -m pytest
```

`pip install -e .` 和 `pip install -e "[test]"` 会把项目以 editable 方式注册到当前 Python 环境，不会生成发布目录；如果不希望污染系统 Python，请先创建仓库外的虚拟环境。

## 生成 Studio 发布目录

`publish` 会从 `wallpapers/wallpapers.db` 生成供 Studio 前端使用的临时发布目录：

- 版本化 JSON 目录：Studio Wallpapers 默认读取该文件，不再通过 SQL 查询 SQLite。
- bootstrap JSON：只包含默认筛选的首屏 20 条壁纸，用于快速首屏展示。
- manifest：记录 JSON 目录和 bootstrap 的版本化文件名与大小。

JSON 目录包含壁纸元数据、封面 CDN 地址、视频预览 CDN 地址、标签和分类 ID。前端 Worker 会在浏览器中建立索引，并将完整 JSON 保存到 IndexedDB；后续刷新优先从本地持久化目录读取。

```bash
PYTHONPATH=src python3 -m wallpapers publish \
  --db wallpapers.db \
  --output-dir ../studio/public/data
```

也可以在仓库根目录构建 Studio 时显式生成：

```bash
./build.sh studio --with-wallpapers
```

如果只需要生成或更新 JSON，不执行 Studio 构建：

```bash
./build.sh wallpapers
./build.sh w
```

该命令以 `studio/public/data/` 为源目录；当 `build/studio.meowv.com/` 已存在时，会额外同步 JSON 到其 `data/` 目录。

普通 `./build.sh studio` 不会读取源数据库。通过 `./build.sh wallpapers` 或 `./build.sh studio --with-wallpapers` 生成的 Studio 部署目录会自动将 catalog 和 bootstrap 加密为版本化 `.bin` 文件；公开的 `wallpapers.catalog.json` 仅包含 manifest 元数据。上述目录均为部署产物，不提交 Git。

直接运行 `python3 -m wallpapers publish` 只生成加密前的临时 JSON，适合调试发布内容；部署前应使用根目录的 `build.sh wallpapers` 完成加密和清理。

默认数据库路径为：

```text
./wallpapers.db
```

可以使用 `--db` 指定其他 SQLite 文件。`--db` 可以放在根命令后，也可以放在子命令后：

```bash
PYTHONPATH=src python3 -m wallpapers --db ./data/wallpapers.db crawl
PYTHONPATH=src python3 -m wallpapers crawl --db ./data/wallpapers.db
```

## 导出 livewall 壁纸清单

`export-livewall` 从 SQLite 导出供 macOS 客户端 [`livewall/`](../livewall/README.md) 使用的**明文 JSON 清单目录**。与 `publish` 的区别：不加密、不分桶。每条导出两个地址：可直接播放的 `video_preview`（`url`）与静态图 `image`（`coverUrl`，供客户端的锁屏预览与手动下载使用）。

```bash
PYTHONPATH=src python3 -m wallpapers export-livewall
PYTHONPATH=src python3 -m wallpapers export-livewall --device mobile --content dynamic
PYTHONPATH=src python3 -m wallpapers export-livewall --default-category 风景
```

默认导出「桌面 + 动态」，输出到 `../studio/public/data/livewall/`：

| 文件 | 说明 |
| --- | --- |
| `catalog.json` | **纯索引**。分类清单（含条目数为 0 的分类）+ 默认分类 + **每个切片的 `sha256`**，**不含任何条目** —— 它是客户端启动时唯一必拉的文件，大小随分类数量线性增长 |
| `category.<一级分类 id>.json` | 每个**有内容**的一级分类一份，结构沿用旧版单文件清单。客户端按选中分类单独拉取 |
| `catalog.json.sig` | 索引的 Ed25519 签名，由 `../livewall/tools/sign-version.swift` 产出（见下节） |

**索引里的 `sha256` 是每个切片的字节摘要**（对切片文件**原始字节**算，64 位小写十六进制）。它同时服务两件事：让客户端能验「这个切片确实属于这份索引」、以及让签名只需覆盖索引一个文件 —— 不需要为每个分类分别签名或在启动时额外拉取多份签名。条目数为 0 的分类**没有** `sha256` 字段（它没有切片文件，给个摘要反而是个陷阱）。

文件名用数字 id 而不是分类名：中文名进 URL 会触发百分号编码，CDN / nginx 侧行为不可控。放在 `livewall/` 子目录里是为了与 Studio 的 `wallpapers.catalog.*` 分开 —— `encrypt-wallpaper.mjs` 要求同目录下「恰好 5 个」`wallpapers.catalog.*.json`，混在一起会让它直接报错。

| 参数                 | 默认值                  | 说明                                                             |
| -------------------- | ----------------------- | ---------------------------------------------------------------- |
| `--db PATH`          | `wallpapers.db`         | 源 SQLite 数据库路径                                             |
| `--output-dir DIR`   | `../studio/public/data` | 输出目录，清单写入其下的 `livewall/` 子目录                      |
| `--device`           | `desktop`               | `desktop` 或 `mobile`                                            |
| `--content`          | `dynamic`               | `static` 或 `dynamic`                                            |
| `--default-category` | `美女`                  | 默认分类，可填分类名或分类 id；该分类会被排在 `categories` 首位  |

导出只保留 `status='active'`、`media_role IN ('video_preview','image')` 且 `accessible=1` 的记录；同一壁纸有多个同类地址时，按 `wallpaper_asset` 的 `is_primary` / `sort_order` / `asset.id` 取第一个。**只有 `image`、没有 `video_preview` 的壁纸不进清单** —— 它没有可播放地址。`duration_seconds` 允许为空；导出保留原值，客户端在需要时自行探测。

`coverUrl` 必须直接取数据库导出的 `image` 资源地址，不能根据视频 URL 的命名规律推导。静态图可能与视频使用不同的资源 id、扩展名或日期段；客户端因此保留抓帧回退。`asset.accessible` 对静态图也不是实时探测结果，不能把它当成线上可用性证明。

注意 `asset.accessible` 对静态图**不是真实探测结果**：`pipeline` 从不做 HEAD（走列默认值 1），只有独立的 `wallpapers check` 子命令才会探测，而 `build.sh` 不调用它。所以 `coverUrl` 仍可能 404，客户端必须能降级。

分类切分的三条约定：

- **一级分类**（`parent_id IS NULL`）是切分单位，一棵子树进同一份文件。子树匹配用递归 CTE —— 旧实现只比较「自身或直接父级」，三级及更深的分类会漏掉。
- **分类清单包含 0 条的分类**（`file` 为 `null`），客户端菜单需要显示全部；但不为它们落文件 —— 客户端拿到 `items` 为空的清单会判定为「解析失败」并触发降级，写出来是个陷阱。
- **一张壁纸可以出现在多份分类文件里**（`wallpaper_category` 是多对多）。索引里没有条目，所以**不属于任何分类的壁纸哪儿都到不了**；导出前应通过数据库检查发现这类异常，而不是在客户端猜测归属。

导出**不做分类过滤**：数据库只扫一遍，切分在 Python 侧做，所以分类数量不影响耗时。每次导出会清理上一轮遗留的 `category.*.json`（分类被删或改名后会留下孤儿文件）。

索引与分类文件**同批生成、共用同一个 `generatedAt`**，客户端据此判断两份产物是否一致。清单结构与客户端约定一一对应，改动需两边同步（见 `src/wallpapers/export.py` 与 `livewall/Sources/LiveWallCore/CatalogModel.swift`）。

**新增条目字段一律不升 `schemaVersion`**：客户端解码用 `decodeIfPresent` 容错，老客户端忽略未知键即可；升版本会让它撞上 `unsupportedSchema` 直接拒绝加载整份清单（`coverUrl` 就是这么加的）。另外**索引刻意不含 `items`**，条目只写在分类切片里 —— 所以新增条目字段只影响切片体积，索引只随分类数增长。

根目录的 `./build.sh wallpapers` 与 `./build.sh studio --with-wallpapers` 在生成并加密 Studio 壁纸目录时，会同时生成 `studio/public/data/livewall/` 并同步到 `build/studio.meowv.com/data/livewall/`。手工单独导出时使用上面的命令。

> 旧版的单文件清单 `studio/public/data/livewall.json` 已废弃并删除。

## 索引签名

索引是客户端唯一无条件信任的输入（它决定了菜单里显示什么、以及每个切片该长什么样）。裸 https 只保护传输，**保护不了「服务端被改」** —— 静态站被入侵、发布脚本被改、CDN 缓存被投毒，都能改出一个合法但有害的 `catalog.json`。因此索引与 `livewall` 的 `version.json` 走同一套 Ed25519 签名：私钥在本机离线（`~/.livewall-signing/`，仓库外），公钥内嵌客户端。

签名覆盖索引的**原始字节**，产出 `catalog.json.sig`。发布链路上由 `./build.sh wallpapers` 自动调用 `livewall/tools/sign-version.swift sign --catalog`：

```bash
# 手工签（等价于 build.sh 里那一步；在 livewall/ 目录下执行）
../livewall/tools/sign-version.swift sign \
  --json ../studio/public/data/livewall/catalog.json --catalog

# 回验（用客户端内嵌公钥，不是签名方自己的公钥）
../livewall/tools/sign-version.swift verify \
  --json ../studio/public/data/livewall/catalog.json
```

`--catalog` 模式在签名前会先做一次**摘要对账**：逐个读索引里登记的切片文件、算 sha256、与索引声明的值比对。任何一处不符（切片被改、文件缺失、索引里没有 `categories`）都直接中止，**不会签出一份指向坏产物的索引**。

签名只覆盖索引，切片的完整性靠索引里的 `sha256` —— 客户端的校验顺序是「先验索引签名 → 再用索引里的摘要校验切片」，所以**给切片重新签名是无效的**（摘要对不上就拒收）。

> ⚠️ `catalog.json` 与 `catalog.json.sig` **必须同一次发布**。只传索引不传 `.sig` 的表现是客户端**完全用不了清单**（签名缺失即不可用，没有「验不过就退回只看摘要」的降级路），且症状与「线上没发新版」无法区分。落地新客户端前必须**先部署 `.sig`**，否则升级即「无可用清单」。

## 数据范围

采集器区分以下维度：

| 维度       | 可选值                                                 | 说明                                   |
| ---------- | ------------------------------------------------------ | -------------------------------------- |
| 设备       | `desktop`、`mobile`                                    | 电脑端或手机端资源                     |
| 内容       | `dynamic`、`static`                                    | 动态壁纸或静态壁纸                     |
| 媒体类型   | `image`、`video`                                       | 图片或视频资源                         |
| 媒体角色   | `image`、`cover`、`video_preview`、`video_original` 等 | 当前公开接口主要提供图片和视频预览地址 |
| 关键词类型 | `query`、`tag`                                         | 用户传入的搜索词，或接口返回的资源标签 |

项目只访问公开接口，不登录、不读取 Cookie、不提交用户数据，也不绕过付费或权限校验。接口中的 `fee_type` 和 `price` 会原样保存。

## 数据库表结构

数据库初始化和兼容迁移由 [`src/wallpapers/db.py`](src/wallpapers/db.py) 完成。所有时间字段使用 UTC ISO 8601 文本；SQLite 布尔值使用 `0` / `1`。

### `wallpaper`

壁纸主表，每个稳定资源一行。

| 字段                                | 说明                                            |
| ----------------------------------- | ----------------------------------------------- |
| `id`                                | 本地自增主键                                    |
| `source`                            | 数据来源标识，例如 `shanhutech-desktop-dynamic` |
| `remote_id`、`remote_qid`           | 远程接口中的资源 ID、作者/队列 ID               |
| `stable_key`                        | 稳定去重键，唯一                                |
| `device_type`                       | `desktop` 或 `mobile`                           |
| `content_type`                      | `static` 或 `dynamic`                           |
| `title`、`author`                   | 标题和作者                                      |
| `fee_type`、`price`                 | 付费类型和接口价格                              |
| `resolution_raw`、`width`、`height` | 原始分辨率和解析后的宽高                        |
| `duration_seconds`                  | 动态资源时长（若接口提供）                      |
| `remote_created_at`                 | 远程创建时间                                    |
| `first_seen_at`、`last_seen_at`     | 首次和最近发现时间                              |
| `status`                            | `active`、`missing`、`inactive`                 |
| `last_seen_run_id`                  | 最近一次发现该资源的抓取任务                    |
| `missing_count`                     | 完整校对中连续未发现次数                        |
| `raw_json`                          | 最近一次接口返回的原始资源 JSON                 |

### `asset`

媒体资源表，按规范化 CDN URL 去重。

| 字段                                  | 说明                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| `id`                                  | 本地自增主键                                           |
| `url`                                 | 原始或规范化后的 CDN 地址，唯一                        |
| `normalized_url`                      | 统一后的地址，当前会将 `http` 转为 `https`             |
| `media_type`                          | `image`、`video`、`other`                              |
| `media_role`                          | `image`、`cover`、`video_preview`、`video_original` 等 |
| `width`、`height`、`duration_seconds` | 媒体属性                                               |
| `file_size`、`mime_type`              | 文件大小和 MIME 类型                                   |
| `http_status`、`accessible`           | 最近一次地址检查结果                                   |
| `first_checked_at`、`last_checked_at` | 地址检查时间                                           |

### 关系表

| 表                   | 说明                                                 |
| -------------------- | ---------------------------------------------------- |
| `wallpaper_asset`    | 壁纸与图片/视频资源的多对多关系，包含主资源和排序    |
| `wallpaper_category` | 壁纸与分类的多对多关系，区分 `primary` / `secondary` |
| `wallpaper_keyword`  | 壁纸与搜索词、标签的多对多关系                       |

### `category`

分类表，支持一级、二级分类。

| 字段                          | 说明                           |
| ----------------------------- | ------------------------------ |
| `source`                      | 分类来源                       |
| `device_type`、`content_type` | 分类所属设备和内容类型         |
| `remote_key`                  | 接口分类 ID 或分类名称         |
| `name`                        | 分类名称                       |
| `level`                       | `1` 为一级分类，`2` 为二级分类 |
| `parent_id`                   | 二级分类对应的一级分类         |
| `sort_order`                  | 接口排序值                     |

### `keyword`

关键词表。

| 字段           | 说明                                         |
| -------------- | -------------------------------------------- |
| `keyword`      | 关键词文本                                   |
| `keyword_type` | `query` 表示命令行搜索词，`tag` 表示接口标签 |

### `crawl_run`

一次抓取任务的汇总记录。

| 字段                        | 说明                                      |
| --------------------------- | ----------------------------------------- |
| `id`                        | 任务 ID                                   |
| `started_at`、`finished_at` | 开始和结束时间                            |
| `status`                    | `running`、`success`、`partial`、`failed` |
| `mode`                      | `quick`、`incremental`、`full`            |
| `total_requests`            | 本次请求数量                              |
| `total_items`               | 本次处理的资源数量                        |
| `total_assets`              | 数据库中的媒体资源总数                    |
| `error_message`             | 任务级错误信息                            |

### `crawl_request`

每个分类、搜索、分页或 manifest 请求的明细。

| 字段                          | 说明                                                   |
| ----------------------------- | ------------------------------------------------------ |
| `run_id`                      | 所属抓取任务                                           |
| `request_type`                | `manifest`、`newest`、`category`、`search`、`fallback` |
| `endpoint`                    | 实际请求地址                                           |
| `device_type`、`content_type` | 请求所属维度                                           |
| `category_id`                 | 请求对应的本地分类                                     |
| `search_keyword`              | 请求使用的搜索词                                       |
| `page`、`page_size`           | 分页参数                                               |
| `http_status`                 | HTTP 状态码                                            |
| `response_hash`               | 响应摘要                                               |
| `response_json`               | 原始 JSON 文本                                         |
| `error_message`               | 请求错误信息                                           |

### `wallpaper_discovery`

记录某个壁纸由哪个请求发现，可用于追踪来源、分页和搜索词。

### `crawl_cursor`

增量抓取游标。按来源、设备、内容类型和作用域保存最近成功位置。

| 字段                     | 说明                           |
| ------------------------ | ------------------------------ |
| `scope_type`             | `newest`、`category`、`search` |
| `scope_key`              | 分类名称、分类 ID 或搜索词     |
| `last_remote_created_at` | 最近成功页的远程创建时间水位   |
| `last_remote_id`         | 最近成功页的远程 ID            |
| `last_page_hash`         | 首页稳定键摘要                 |
| `last_success_at`        | 游标更新时间                   |

## `crawl` 抓取命令

基本格式：

```bash
PYTHONPATH=src python3 -m wallpapers crawl [选项]
```

### 参数说明

| 参数              | 默认值          | 说明                                                                   |
| ----------------- | --------------- | ---------------------------------------------------------------------- |
| `--db PATH`       | `wallpapers.db` | SQLite 数据库路径。可放在根命令后或 `crawl` 后                         |
| `--device VALUE`  | `all`           | 设备范围：`desktop`、`mobile`、`all`                                   |
| `--content VALUE` | `all`           | 内容范围：`static`、`dynamic`、`all`                                   |
| `--mode VALUE`    | `incremental`   | 抓取模式：`quick`、`incremental`、`full`                               |
| `--category NAME` | 空              | 分类过滤，可重复传入。没有关键字时生效                                 |
| `--keyword TEXT`  | 空              | 搜索关键字，可重复传入。传入后优先走搜索接口，分类过滤不再参与分页抓取 |
| `--page-size N`   | `24`            | 每页请求数量，程序会将小于 `1` 的值修正为 `1`                          |
| `--max-pages N`   | 不限制          | 单个分类或搜索作用域最多抓取页数                                       |
| `--refresh`       | 关闭            | 兼容参数，等同于 `--mode full`                                         |
| `-h`、`--help`    | -               | 显示抓取命令帮助                                                       |

### 抓取模式

#### `incremental`

默认模式。每个分类或搜索作用域从第一页开始。如果已有成功游标，并且当前页资源全部已知、同时没有更新的远程资源，就停止继续翻页。新作用域没有游标时会完整遍历。

#### `quick`

每个作用域只请求第一页，不更新正式游标。适合高频检查新增内容。

#### `full`

遍历全部分页并更新游标。当没有指定分类、关键字或 `--max-pages` 时，还会执行完整校对：资源第一次未发现标记为 `missing`，连续两次完整校对未发现后标记为 `inactive`；重新发现会恢复为 `active`。

### 示例

抓取全部设备和内容：

```bash
PYTHONPATH=src python3 -m wallpapers crawl
```

只抓电脑动态壁纸的风景分类：

```bash
PYTHONPATH=src python3 -m wallpapers crawl \
  --device desktop \
  --content dynamic \
  --category 风景
```

只抓手机静态壁纸，每个分类最多 3 页：

```bash
PYTHONPATH=src python3 -m wallpapers crawl \
  --device mobile \
  --content static \
  --max-pages 3
```

按多个关键字搜索：

```bash
PYTHONPATH=src python3 -m wallpapers crawl \
  --keyword 雨夜 \
  --keyword 溪流 \
  --mode quick
```

强制执行完整抓取：

```bash
PYTHONPATH=src python3 -m wallpapers crawl --refresh
```

## 站点规划查询 SQL

推荐将站点导航统一映射为三层：

| 导航层级 | 数据字段 | 展示值 |
| --- | --- | --- |
| 大分类 | `wallpaper.device_type` | `desktop` 显示为“电脑壁纸”，`mobile` 显示为“手机壁纸” |
| 小分类 | `wallpaper.content_type` | `dynamic` 显示为“动态壁纸”，`static` 显示为“静态壁纸” |
| 壁纸分类 | `category` + `wallpaper_category` | “双屏”“动漫”“美女”等，支持一级分类和二级分类 |

“全部”是界面筛选项，不需要在 `category` 表中增加一条特殊记录。查询时传入 `NULL` 或字符串“全部”即可表示不限制该维度。

### 推荐查询视图

该视图将数据库字段转换成适合站点列表和后台管理的展示字段。一个壁纸拥有多个分类时会返回多行，这是有意保留的分类关系。

```sql
CREATE VIEW IF NOT EXISTS v_wallpaper_catalog AS
SELECT
    w.id,
    w.stable_key,
    w.source,
    w.remote_id,
    w.title,
    w.author,
    w.device_type,
    CASE w.device_type
        WHEN 'desktop' THEN '电脑壁纸'
        WHEN 'mobile' THEN '手机壁纸'
    END AS big_category,
    w.content_type,
    CASE w.content_type
        WHEN 'dynamic' THEN '动态壁纸'
        WHEN 'static' THEN '静态壁纸'
    END AS small_category,
    CASE WHEN c.level = 2 THEN parent.name ELSE c.name END AS category_name,
    CASE WHEN c.level = 2 THEN c.name END AS subcategory_name,
    c.level AS category_level,
    w.status,
    w.width,
    w.height,
    w.duration_seconds,
    w.remote_created_at,
    w.first_seen_at,
    w.last_seen_at
FROM wallpaper AS w
LEFT JOIN wallpaper_category AS wc ON wc.wallpaper_id = w.id
LEFT JOIN category AS c ON c.id = wc.category_id
LEFT JOIN category AS parent ON parent.id = c.parent_id;
```

### 首页或“全部”列表

以下参数约定：`:device` 可取 `desktop`、`mobile`、`all`；`:content` 可取 `static`、`dynamic`、`all`；`:category` 为分类名称或“全部”。

```sql
SELECT
    v.*,
    a.url AS asset_url,
    a.media_type,
    a.media_role
FROM v_wallpaper_catalog AS v
LEFT JOIN wallpaper_asset AS wa ON wa.wallpaper_id = v.id
LEFT JOIN asset AS a ON a.id = wa.asset_id
WHERE (:device = 'all' OR v.device_type = :device)
  AND (:content = 'all' OR v.content_type = :content)
  AND (:category IS NULL OR :category = '全部' OR v.category_name = :category OR v.subcategory_name = :category)
  AND v.status = 'active'
ORDER BY COALESCE(v.remote_created_at, v.first_seen_at) DESC, v.id DESC
LIMIT :limit OFFSET :offset;
```

如果列表只需要每个壁纸一行，不要直接连接 `asset`，或者使用 `EXISTS` 过滤资源：

```sql
SELECT v.*
FROM v_wallpaper_catalog AS v
WHERE (:device = 'all' OR v.device_type = :device)
  AND (:content = 'all' OR v.content_type = :content)
  AND (:category IS NULL OR :category = '全部' OR v.category_name = :category OR v.subcategory_name = :category)
  AND v.status = 'active'
GROUP BY v.id
ORDER BY COALESCE(v.remote_created_at, v.first_seen_at) DESC, v.id DESC
LIMIT :limit OFFSET :offset;
```

### 动态壁纸同时包含静态壁纸

站点可以提供一个“动态 + 静态”展示模式。建议使用参数值 `dynamic_with_static`，而不是修改数据库中的 `content_type`：

```sql
SELECT v.*
FROM v_wallpaper_catalog AS v
WHERE (:device = 'all' OR v.device_type = :device)
  AND (
        :content_mode = 'all'
        OR v.content_type = :content_mode
        OR (
            :content_mode = 'dynamic_with_static'
            AND v.content_type IN ('dynamic', 'static')
        )
      )
  AND (:category IS NULL OR :category = '全部' OR v.category_name = :category OR v.subcategory_name = :category)
  AND v.status = 'active'
GROUP BY v.id
ORDER BY COALESCE(v.remote_created_at, v.first_seen_at) DESC, v.id DESC
LIMIT :limit OFFSET :offset;
```

如果需要优先展示动态，再展示静态，可以增加排序：

```sql
ORDER BY
    CASE v.content_type WHEN 'dynamic' THEN 0 ELSE 1 END,
    COALESCE(v.remote_created_at, v.first_seen_at) DESC,
    v.id DESC;
```

### 分类导航，包含“全部”和二级分类

返回某个设备和内容类型下的一级分类，并在最前面加入界面使用的“全部”：

```sql
SELECT
    0 AS id,
    '全部' AS name,
    NULL AS parent_id,
    0 AS level,
    0 AS sort_order
UNION ALL
SELECT id, name, parent_id, level, sort_order
FROM category
WHERE (:device = 'all' OR device_type = :device)
  AND (:content = 'all' OR content_type = :content)
  AND level = 1
ORDER BY sort_order, id;
```

查询某个一级分类下的二级分类：

```sql
SELECT id, name, parent_id, level, sort_order
FROM category
WHERE parent_id = :parent_category_id
ORDER BY sort_order, id;
```

查询分类及其资源数量：

```sql
SELECT
    c.id,
    c.name,
    c.level,
    c.parent_id,
    COUNT(DISTINCT w.id) AS wallpaper_count
FROM category AS c
LEFT JOIN wallpaper_category AS wc ON wc.category_id = c.id
LEFT JOIN wallpaper AS w ON w.id = wc.wallpaper_id AND w.status = 'active'
WHERE (:device = 'all' OR c.device_type = :device)
  AND (:content = 'all' OR c.content_type = :content)
GROUP BY c.id
ORDER BY c.level, c.sort_order, c.id;
```

### 查询单个壁纸的全部 CDN 地址

```sql
SELECT
    w.id,
    w.title,
    w.device_type,
    w.content_type,
    a.url,
    a.media_type,
    a.media_role,
    a.mime_type,
    a.width,
    a.height,
    a.duration_seconds,
    a.accessible,
    a.last_checked_at
FROM wallpaper AS w
JOIN wallpaper_asset AS wa ON wa.wallpaper_id = w.id
JOIN asset AS a ON a.id = wa.asset_id
WHERE w.id = :wallpaper_id
ORDER BY wa.sort_order, a.id;
```

只查询动态壁纸视频预览地址：

```sql
SELECT w.id, w.title, a.url
FROM wallpaper AS w
JOIN wallpaper_asset AS wa ON wa.wallpaper_id = w.id
JOIN asset AS a ON a.id = wa.asset_id
WHERE w.device_type = :device
  AND w.content_type = 'dynamic'
  AND a.media_role = 'video_preview'
  AND w.status = 'active'
ORDER BY COALESCE(w.remote_created_at, w.first_seen_at) DESC;
```

### 关键词搜索

搜索用户输入的关键字，`keyword_type = 'query'`；搜索接口返回的标签，使用 `keyword_type = 'tag'`。

```sql
SELECT DISTINCT v.*
FROM v_wallpaper_catalog AS v
JOIN wallpaper_keyword AS wk ON wk.wallpaper_id = v.id
JOIN keyword AS k ON k.id = wk.keyword_id
WHERE k.keyword = :keyword
  AND k.keyword_type IN ('query', 'tag')
  AND v.status = 'active'
  AND (:device = 'all' OR v.device_type = :device)
  AND (:content = 'all' OR v.content_type = :content)
ORDER BY COALESCE(v.remote_created_at, v.first_seen_at) DESC, v.id DESC
LIMIT :limit OFFSET :offset;
```

### 分页总数

分页查询必须使用与列表查询相同的筛选条件。由于分类视图可能一壁纸多行，使用 `COUNT(DISTINCT v.id)`：

```sql
SELECT COUNT(DISTINCT v.id) AS total
FROM v_wallpaper_catalog AS v
WHERE (:device = 'all' OR v.device_type = :device)
  AND (:content = 'all' OR v.content_type = :content)
  AND (:category IS NULL OR :category = '全部' OR v.category_name = :category OR v.subcategory_name = :category)
  AND v.status = 'active';
```

### 站点统计

按大分类和小分类统计：

```sql
SELECT
    CASE device_type WHEN 'desktop' THEN '电脑壁纸' ELSE '手机壁纸' END AS big_category,
    CASE content_type WHEN 'dynamic' THEN '动态壁纸' ELSE '静态壁纸' END AS small_category,
    COUNT(*) AS wallpaper_count
FROM wallpaper
WHERE status = 'active'
GROUP BY device_type, content_type
ORDER BY device_type, content_type;
```

按媒体角色统计 CDN 地址：

```sql
SELECT media_type, media_role, COUNT(*) AS asset_count
FROM asset
GROUP BY media_type, media_role
ORDER BY media_type, media_role;
```

查询最近一次抓取任务：

```sql
SELECT id, mode, status, started_at, finished_at,
       total_requests, total_items, total_assets, error_message
FROM crawl_run
ORDER BY id DESC
LIMIT 1;
```

### CDN 健康和数据维护

查询当前无法访问的资源：

```sql
SELECT id, url, media_type, media_role, http_status, last_checked_at
FROM asset
WHERE accessible = 0
   OR (http_status IS NOT NULL AND http_status >= 400)
ORDER BY last_checked_at ASC;
```

查询待复核或已下架的壁纸：

```sql
SELECT id, title, device_type, content_type, status, missing_count, last_seen_at
FROM wallpaper
WHERE status IN ('missing', 'inactive')
ORDER BY last_seen_at ASC;
```

查询没有任何媒体地址的异常壁纸：

```sql
SELECT w.id, w.stable_key, w.title
FROM wallpaper AS w
LEFT JOIN wallpaper_asset AS wa ON wa.wallpaper_id = w.id
WHERE wa.wallpaper_id IS NULL;
```

这些查询可以直接用于后续站点的首页、设备导航、动态/静态筛选、分类页、搜索页、详情页和后台数据看板。

## `stats` 统计命令

基本格式：

```bash
PYTHONPATH=src python3 -m wallpapers stats [--db PATH]
```

参数：

| 参数           | 默认值          | 说明                   |
| -------------- | --------------- | ---------------------- |
| `--db PATH`    | `wallpapers.db` | 要读取的 SQLite 数据库 |
| `-h`、`--help` | -               | 显示帮助               |

输出每个 `device_type + content_type` 组合的壁纸数量。

## `check` CDN 检查命令

基本格式：

```bash
PYTHONPATH=src python3 -m wallpapers check [--db PATH]
```

该命令逐条对 `asset.url` 发起 `HEAD` 请求，并更新 `http_status`、`mime_type`、`accessible` 和检查时间。它不会下载媒体内容。

参数：

| 参数           | 默认值          | 说明                   |
| -------------- | --------------- | ---------------------- |
| `--db PATH`    | `wallpapers.db` | 要检查的 SQLite 数据库 |
| `-h`、`--help` | -               | 显示帮助               |

## 来源接口

采集器优先使用公开 JSON 接口：

- 电脑动态：`bizhi.shanhutech.cn/live/...`
- 电脑静态：`wp.shanhutech.cn/intf/...`
- 手机动态和静态：`digbird.shanhutech.cn/intf/...`
- 静态 manifest：`ios.25pan.com/wallpaper/list.json`

请求具有超时、限速和 `429/5xx` 指数退避重试。HTML 或错误 JSON 不会被当作有效 manifest。

## 验证

```bash
PYTHONPATH=src python3 -m compileall -q src
PYTHONPATH=src python3 -m pytest
git diff --check
```

`pytest` 属于可选测试依赖，可通过以下命令安装：

```bash
python3 -m pip install -e '.[test]'
```

项目默认不执行整站线上抓取。需要运行完整任务时，请确认接口访问频率和资源使用符合站点规则。

改动前先读 [`AGENTS.md`](./AGENTS.md)：那里写明了 `export-livewall` 产物与 livewall 客户端的契约（索引不含条目、新增字段不升 `schemaVersion`、递归 CTE 分类匹配等），以及加密、密钥与生成物方面的边界。
