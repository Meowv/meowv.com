# wallpapers 协作指南

适用范围：`wallpapers/`。仓库通用规则见 [根 AGENTS.md](../AGENTS.md)；用途、结构、命令和产物见 [README.md](./README.md)。

## 修改边界

- 本项目使用 Python ≥3.12、标准库和 SQLite；测试依赖见 `pyproject.toml`。遵守已有数据模型、资源角色、UTC 时间和 SQLite 布尔值约定。
- 只采集公开接口的元数据和 CDN 地址，不登录、读取 Cookie、下载媒体或绕过付费与权限校验。`fee_type`、`price` 保留接口原值。
- `wallpapers.db`、虚拟环境和 Python 缓存是本地数据或生成物；Studio 的 catalog、bootstrap、manifest、加密 `.bin` 及 `../studio/public/data/livewall/` 清单也不手工修改或提交。
- 加密密钥在仓库根 `.wallpaper-key`，签名私钥在仓库外；不在源码、日志或文档中写入密钥材料。

## 跨项目契约

- `publish` 只产出加密前 JSON；部署数据须由根 `build.sh` 经 Studio 现有加密脚本生成。
- `export-livewall` 的结构须与 `../livewall/Sources/LiveWallCore/CatalogModel.swift` 一致：`catalog.json` 只放分类和切片摘要，不放壁纸条目；新增可选条目字段不升 `schemaVersion`。
- 一级分类以 `parent_id IS NULL` 确定，子树须覆盖更深层级；空分类留在索引中但不落切片。索引与切片同批生成，共用 `generatedAt`；摘要按写盘后的原始字节核对，索引自身由签名保护。
- 重写索引要删除旧 `catalog.json.sig`。签名由根 `build.sh` 调用 `../livewall/tools/sign-version.swift` 完成；单独导出后的清单不可直接供客户端使用。
- `coverUrl` 只能来自数据库中的 `image` 地址，不从视频 URL 推导；`asset.accessible` 对静态图不代表实时可访问。
- SQLite `ORDER BY` 中裸整数表示结果列位置，不用作哨兵值。

## 验证

- 改采集、数据库、导出或发布逻辑：在 `wallpapers/` 运行 `PYTHONPATH=src python3 -m pytest`；测试依赖可用 `python3 -m pip install -e '.[test]'` 安装。语法检查用 `PYTHONPATH=src python3 -m compileall -q src`。
- 改导出与签名链路时，另核对根 `./build.sh wallpapers` 的切片摘要和签名结果；这会生成数据并需要本机签名私钥，运行前遵守仓库对构建的确认要求。
- 默认不运行整站线上抓取；需要抓取时先确认接口访问频率，并用 `--max-pages` 控制范围。收尾检查 `git diff --check` 与 `git status --short`。
