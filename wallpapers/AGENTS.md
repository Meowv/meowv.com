# wallpapers 协作指南

适用范围：`wallpapers/` 目录。仓库级约定见 [`../AGENTS.md`](../AGENTS.md)，项目用途、CLI 参数、数据库表结构与发布说明见 [`README.md`](./README.md)。
本文件只记录本项目的修改边界、约定与验证要求。

## 边界

- 只改本目录内的文件。`../studio/`、`../blog/`、`../livewall/` 是同一 Git 仓库中的独立项目，不在此处顺手处理。
- `wallpapers.db`、`.venv/`、`__pycache__/`、`.pytest_cache/`、`*.py[cod]` 属于本地数据或缓存，不提交 Git（`.gitignore` 已排除）。默认数据库路径 `wallpapers.db` 可以随时重建，**不要把它当版本化数据源**。
- 只访问公开接口。不登录、不读取 Cookie、不提交用户数据、不下载媒体文件，也不绕过付费或权限校验。接口里的 `fee_type` 和 `price` 原样保存，不做判断。
- **不要在源码、日志或文档中写入密钥材料**。壁纸加密密钥在仓库根目录的 `.wallpaper-key`（不提交、不复述其内容）。
- 不手工修改生成物：Studio 的壁纸 catalog、bootstrap、manifest、加密 `.bin`，以及 `../studio/public/data/livewall/` 下的清单目录。

## 代码结构

- `src/wallpapers/cli.py`：CLI 参数与命令分发。
- `src/wallpapers/config.py`：数据源配置与运行常量。
- `src/wallpapers/models.py`：`CategoryData`、`AssetData`、`WallpaperData` 等领域模型。
- `src/wallpapers/normalize.py`：接口返回值到内部字段的规范化（URL、尺寸、标签）。
- `src/wallpapers/pipeline.py`：公开接口抓取、增量游标和资源校验流程。
- `src/wallpapers/db.py`：SQLite 初始化、兼容迁移和查询。
- `src/wallpapers/publish.py`：从 SQLite 生成 Studio catalog、bootstrap 和 manifest。
- `src/wallpapers/export.py`：从 SQLite 导出供 `../livewall/` 使用的明文壁纸清单目录（不加密）—— `catalog.json` 索引（分类清单 + 默认分类，**不含条目**）+ 按一级分类拆分的 `category.<id>.json` 切片。
- `src/wallpapers/sources/`：各公开接口适配器（`base.py` 提供 `HttpClient` 与 `SourceError`，另有 `desktop.py`、`mobile.py`、`manifest.py`）。
- `tests/`：数据库、规范化、抓取流程、接口适配和发布逻辑测试。

## 约定

- 使用 Python `>= 3.12`。**项目无运行时第三方依赖，仅使用标准库**；测试依赖按 `pyproject.toml` 的 `[test]` extra 安装。不要为了让某个功能好写就引入 requests / httpx / pandas。
- 新增接口、字段或抓取范围时，保持 `device_type`、`content_type`、资源角色和 UTC 时间字段的既有约定（所有时间字段为 UTC ISO 8601 文本，SQLite 布尔值用 `0` / `1`）。
- `publish` 生成的 JSON 只是**加密前的临时目录**。部署目录必须经 `../studio/scripts/encrypt-wallpaper.mjs` 处理，使用现有 AES-256-GCM 版本化 `.bin` 格式，并保留 manifest 中的加密版本和文件大小信息。
- **`export-livewall` 的产物结构是客户端契约**，改动必须与 `../livewall/Sources/LiveWallCore/CatalogModel.swift` 同步：
  - `catalog.json` 是**纯索引**，**绝不能把条目塞回索引** —— 它是客户端启动时唯一必拉的文件，塞回去会让启动退回「一次下全量」。`tests` 里的 `test_index_has_no_items` 专门锁这条。
  - 条目字段**新增一律不升 `schemaVersion`**：客户端用 `decodeIfPresent` 容错，升版本会让老客户端撞上 `unsupportedSchema` 直接拒绝加载整份清单（`coverUrl` 就是这么加的）。
  - 分类清单要包含 0 条的分类（`file` 为 `null`），但不为它们落文件 —— 客户端拿到 `items` 为空的清单会判定为解析失败并触发降级。
  - 一级分类（`parent_id IS NULL`）是切分单位，子树匹配必须用递归 CTE；旧实现只比较「自身或直接父级」，三级及更深的分类会漏掉。
  - 索引与切片**同批生成、共用同一个 `generatedAt`**。
- `coverUrl` 只能从数据库字段读，**不要用 URL 规律推导**（换域名 + 去 `_10s_for_html` + 改扩展名会推错）。另外 `asset.accessible` 对静态图不是真实探测结果（`pipeline` 从不做 HEAD），所以文档里不要把它描述成「已验证可访问」。
- SQLite 的 `ORDER BY` 里**裸整数是列位置引用**，不要拿它当哨兵值（曾经把 `999999` 当成第 999999 列）。

## 验证

- 改采集、数据库、导出或发布逻辑：`cd wallpapers && pytest`（轻量、必跑）。
- 改加密脚本：至少 `node --check ../studio/scripts/encrypt-wallpaper.mjs`，并检查 manifest、旧版本文件清理和 `.bin` 输出。
- 快速语法自检：`PYTHONPATH=src python3 -m compileall -q src`。
- **默认不执行整站线上抓取**。需要跑 `crawl` 时先确认接口访问频率和资源使用符合站点规则，并优先用 `--max-pages` 限制范围。
- 收尾跑 `git diff --check` 与 `git status --short`，确认只有预期文件变化。
