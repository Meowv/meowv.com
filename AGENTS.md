# 仓库协作指南

适用于仓库根目录及 `blog/`、`studio/`、`wallpapers/`、`livewall/`、`api/`。项目用途、结构和命令写在各项目 `README.md`；项目修改边界和验证写在各项目 `AGENTS.md`。本文件只保留跨项目规则、根脚本约定和共享安全边界。

## 通用规则

- 默认使用简体中文；代码、命令、路径、API 名称和原始报错保持原文。
- 先确认任务所属项目，只改授权范围内的文件；保留用户已有的无关改动。
- 遵循现有架构、命名、包管理器和格式，优先最小完整改动；不因顺手优化扩大范围。
- 已授权的读操作、检查、可逆修改和修复直接执行。未经明确要求，不提交、推送、建 Tag、建 PR、部署或发布。
- 新增生产依赖、上传、外部服务、遥测或权限变更前，说明必要性和影响并取得同意。
- 文档以脚本、`package.json`、`pyproject.toml`、SwiftPM 配置和源码的实际行为为准；会漂移的清单、数量、版本和测试项不要凭记忆写死。

线上地址固定为：

- Blog：`https://meowv.com`
- Studio：`https://studio.meowv.com`
- Zitie：`https://studio.meowv.com/zitie/`

不得自行推断 `www` 跳转、证书、Nginx 路由或生产目录。

## 安全与生成物

- 不输出或提交 API key、令牌、密码、私钥、证书或个人文件内容。示例使用占位符或环境变量。
- 本机敏感配置：`.deploy.env`、`.wallpaper-key`、`.livewall-key`、`~/.livewall-signing/version-key.txt`。不要读取后复制到源码、日志或文档。
- 不提交 `node_modules/`、`build/`、`.build/`、`dist/`、`public/`、`wallpapers.db`、Python 缓存、`.venv/`、测试报告、覆盖率和 `.DS_Store`。各项目生成物以其 `AGENTS.md` 为准。
- 批量删除、覆盖重要文件、改写 Git 历史、生产部署、远程删除或其他不可逆外部操作，执行前必须说明范围、影响和恢复方式并取得确认。

## 根目录脚本

根目录 `run.sh`、`build.sh`、`deploy.sh` 面向 macOS Bash；子项目脚本由对应项目文档负责。

- `run.sh` / `build.sh` 支持无参数、独占 `all`、一个或多个项目参数，以及 `blog`/`b`、`studio`/`s`、`livewall`/`lw`、`api`/`a` 简写。`run.sh wallpapers`/`w` 默认执行 `crawl`，并支持 `crawl`、`publish`、`stats`、`check`。
- Blog 端口为 `4000`，Studio 端口为 `4001`，API 端口为 `5000`；Zitie 由 Studio 的 `/zitie/` 提供。端口清理只能影响对应监听进程。
- `build.sh` 按参数顺序构建；全量构建成功后才替换 `build/`，指定项目只替换对应目录。固定产物目录为 `build/meowv.com/`、`build/studio.meowv.com/`、`build/studio.meowv.com/api/<RID>/` 和 `build/livewall/LiveWall.app/`。
- `--with-wallpapers` 只能与 `studio` 使用；`--with-dmg` 只能与 `livewall` 使用。前者生成并签名 livewall 内容清单，后者把 DMG、`version.json` 和 `version.json.sig` 放入 Studio 部署目录。
- `catalog.json` 与 `catalog.json.sig` 必须同批生成；`version.json` 与 `version.json.sig` 也必须同批。清理内容清单时不能误删版本更新文件。Studio 单独构建时要保留已有 livewall 更新产物和 API 产物。
- 发布构建才传 `livewall/build.sh --bump-build`；本地运行路径不得递增 `CFBundleVersion`。DMG 文件名、摘要和 `fileURL` 由 `livewall/make-dmg.sh` 生成，根脚本只搬运和核对。
- 保持 macOS Bash 3.2 兼容：不使用 `mapfile` 或关联数组；`set -u` 下遍历可能为空的数组使用 `${ARRAY[*]:-}`。变量紧邻中文或全角字符时使用 `${VAR}`。

修改根脚本后，检查参数帮助、项目数组、别名、端口、依赖检查、构建或启动分支、源目录和目标目录是否同步。

## 验证

- 文档和代码改动后执行相关的语法、类型、Lint、定向测试或 `git diff --check`；只报告实际执行过的检查。
- 修改 shell 脚本至少运行 `bash -n <脚本>`，并在非 `C` locale 下执行一次帮助或 dry-run 路径。
- UI、窗口、交互或部署链路改动，条件允许时做目标环境的短时实际检查；静态检查不能替代人工交互验证。
- 除非用户明确要求，不主动执行完整构建、全量测试、生产部署或端到端验证；若只有这些步骤才能可靠验证，先说明原因并取得确认。

## 文档归属

- 项目用途、目录、运行和构建命令 → 项目 `README.md`
- 项目修改边界、实现不变量和验证 → 项目 `AGENTS.md`
- 跨项目规则、根脚本和产物映射 → 本文件与根 `README.md`

同一事实只维护一份，其他文档使用链接指向来源。
