# 仓库协作指南

## 适用范围与信息来源

本文件适用于根目录及 `blog/`、`studio/`、`wallpapers/`。除 `wallpapers/README.md` 外，子项目不单独维护 `AGENTS.md` 或 `README.md`：

- 根目录 `README.md` 记录项目概览、环境、命令、端口和产物映射；`wallpapers/README.md` 记录采集器的 CLI、数据库和发布细节。
- 本文件记录修改边界、项目约定、验证和交付要求。
- 实际脚本、`package.json`、锁文件与源码配置是可执行行为的最终依据；发现文档不一致时，应在任务范围内同步修正。

三个目录是同一 Git 仓库中的独立项目，不是统一 workspace。执行命令前先进入目标目录，并使用该项目现有的包管理器、运行时和代码风格。

## 通用协作原则

- 默认使用简体中文沟通；代码、命令、路径、API 名称和原始报错保持原文。
- 先确认任务所属项目，只修改明确范围内的文件；不顺带处理其他项目。
- 修改前检查工作区状态和相关差异，不覆盖、撤销或格式化用户已有的无关改动。
- 优先最小改动，复用相邻组件、工具函数、配置和实现模式，避免无关重构、重复实现和过度抽象。
- 注释只在有解释价值时添加，新增或修改的注释默认使用中文。
- 未经明确要求，不提交、不推送、不创建版本、不部署，也不修改生产环境。
- 新增生产依赖、外部服务、上传能力、远程转换、遥测或权限变更前，先说明必要性和影响并取得同意。

涉及链接、Canonical、Sitemap、分享信息或跨站导航时，保持以下线上地址：

- Blog：`https://meowv.com`
- Studio：`https://studio.meowv.com`
- Zitie：`https://studio.meowv.com/zitie/`

不得自行推断 `www` 跳转、证书覆盖、Nginx 路由或生产目录；部署前检查实际环境。

## 根目录脚本约定

- `run.sh` 和 `build.sh` 必须同时支持无参数、独占的 `all`、一个或多个项目参数，以及 `blog`/`b`、`studio`/`s` 简写。
- `run.sh` 的 `wallpapers`/`w` 分支执行 Wallpapers CLI，默认子命令为 `crawl`；支持 `crawl`、`publish`、`stats`、`check`，其余参数原样传递。
- 固定开发端口为 Blog `4000`、Studio `4001`；Zitie 由 Studio 的 `/zitie/` 多页面入口提供，不另启端口。
- `run.sh` 并行启动多个项目，并统一处理退出；修改端口清理逻辑时，不得扩大终止进程的范围。
- `build.sh` 按参数顺序构建。全量构建必须全部成功后再替换 `build/`；指定项目构建只替换对应域名目录。
- 汇总目录固定为 `build/meowv.com/`、`build/studio.meowv.com/`。Studio 产物包含 `dist/zitie/`。
- 保持 macOS Bash 3.2 兼容性；在 `set -u` 下遍历可能为空的数组前先使用 `${SELECTED_PROJECTS[*]:-}` 防护。
- `build/`、暂存目录和备份目录均为可替换生成内容，不提交 Git。
- `build.sh wallpapers` 只生成并加密 Studio 壁纸目录，不构建项目；`./build.sh studio --with-wallpapers` 仅允许与 `studio` 一起使用，并在 Studio 构建前生成目录数据。

修改脚本时，应同步检查参数帮助、项目数组、别名、端口、依赖检查、启动或构建分支、源目录和目标目录，避免只更新其中一处。

## Blog 约定

### 代码结构

- `source/_posts/`：文章。
- `source/_data/`：站点共享数据。
- `source/tools/<slug>/index.md`：Labs 工具入口页。
- `themes/hexo-theme-matery/layout/`：EJS 模板。
- `themes/hexo-theme-matery/source/`：主题 CSS、JavaScript、图片和第三方资源。
- `source/games/`：跳过 Hexo 渲染的独立静态应用。

常规 Labs 工具应同时维护入口 Markdown、同名 EJS 模板和 `source/_data/tools.json` 注册项。工具 slug 与文件名使用小写短横线。

修改文章、Front Matter、主题配置或模板时，检查 YAML、JSON、EJS 语法及生成后的目标页面。交互工具还应检查桌面端、移动端、控制台和异常路径。

## Studio 约定

### 代码结构

- `src/features/`：按能力划分的功能模块。
- `src/pages/`、`src/layouts/`、`src/router/`：页面、应用壳和路由。
- `src/components/`、`src/composables/`：共享组件和组合式逻辑。
- `src/core/`：浏览器、本地隐私和通用基础能力。
- `src/assets/`、`public/`：样式和静态资源。
- `src/features/zitie/`：独立 React 字帖应用的组件、配置、Canvas、字体和导出逻辑。
- `zitie.html`：Zitie 所有页面共用的唯一 HTML 源模板。
- `public/zitie/`：Zitie 字体、Logo、图标等静态资源。

使用 Vue 3 Composition API、严格 TypeScript 和现有 `@/` 路径别名。首页不得预加载重型编辑器或 WASM；文件打开、新建、保存和销毁必须经过统一会话与串行编辑器队列。

用户文件、图片和附件不得上传，也不得写入 Cookie、日志或远程数据库。涉及文件系统、导出、Worker 或对象 URL 时，保留现有的授权、取消和资源释放处理。

Zitie 使用 React 18 函数组件和严格 TypeScript，遵循 Studio 的 Prettier 规则、PascalCase 组件和 camelCase 函数命名。其 HTML 只加载 Zitie React 入口和 CSS，不加载 Vue、`StudioShell` 或 Studio CSS；不要将 `/zitie` 注册到 Vue Router。

Zitie 的 pathname、练习模式和页面元数据统一维护在 `src/features/zitie/routes.ts`。开发时由 Vite 中间件从单一 HTML 模板响应各页面，构建时再生成目录式 HTML；不要为每条路由复制相同的源 HTML。笔顺数据在开发时直接从 `hanzi-writer-data` 响应，构建时复制到 `dist/zitie/hanzi-data/`；不要生成或提交 `public/zitie/hanzi-data/`。涉及分页、Canvas、字体、打印或导出时，验证应覆盖多页、PNG/PDF/ZIP 导出、打印、窄屏布局和资源路径。

## Wallpapers 约定

### 代码结构

- `src/wallpapers/cli.py`：CLI 参数与命令分发。
- `src/wallpapers/pipeline.py`：公开接口抓取、增量游标和资源校验流程。
- `src/wallpapers/db.py`：SQLite 初始化、兼容迁移和查询。
- `src/wallpapers/publish.py`：从 SQLite 生成 Studio catalog、bootstrap 和 manifest。
- `tests/`：数据库、规范化、抓取流程和发布逻辑测试。

使用 Python `>= 3.12`。项目无运行时第三方依赖；测试依赖按 `pyproject.toml` 的 `[test]` extra 安装。默认数据库为 `wallpapers/wallpapers.db`，该文件属于本地数据，不提交 Git。

采集器只访问公开接口并保存元数据和 CDN 地址，不登录、不读取 Cookie、不下载媒体文件，也不绕过付费或权限校验。新增接口、字段或抓取范围时，保持 `device_type`、`content_type`、资源角色和 UTC 时间字段的既有约定。

`publish` 生成的 JSON 仅作为加密前的临时目录；部署目录必须经 `studio/scripts/encrypt-wallpaper.mjs` 处理，使用现有 AES-256-GCM 版本化 `.bin` 格式，并保留 manifest 中的加密版本和文件大小信息。不要在源码、日志或文档中写入新的密钥材料。

修改采集、数据库或发布逻辑时，优先运行 `cd wallpapers && pytest`；修改加密脚本时，至少执行 `node --check studio/scripts/encrypt-wallpaper.mjs`，并检查 manifest、旧版本文件清理和 `.bin` 输出。

## 验证规则

- 优先执行与改动直接相关的轻量检查，例如语法、格式、类型检查、定向测试或 `git diff --check`。
- 除非用户明确要求，不主动执行完整编译、完整构建、全量测试或端到端测试；只有完整构建才能可靠验证时，先说明原因并征得同意。
- 界面或交互改动不能只凭静态检查判定完成；条件允许时启动目标项目，检查实际页面、关键交互、窄屏布局、控制台和异常路径。
- 将语法、类型、Lint、构建、浏览器、部署和生产验证视为不同证据层级，只报告实际执行过的检查。

## 安全与清理

- 不输出或提交真实 API 密钥、令牌、密码、证书、个人文件内容或其他敏感信息；示例使用环境变量或明确占位符。
- 不提交 `node_modules/`、构建目录、测试报告、覆盖率目录、`*.tsbuildinfo`、`.DS_Store` 或 `.gitignore` 已排除的内容。
- 不提交 Wallpapers 的 `*.db`、`.venv/`、`__pycache__/`、`.pytest_cache/`，也不手工修改生成的 Studio 壁纸 catalog、bootstrap、manifest 或加密 `.bin` 文件。
- 清理前先区分源码、配置、依赖、缓存、构建产物和用户本地数据；列出拟删除目标及依据，不确定用途时先查引用和 Git 历史。
- 批量删除、覆盖重要文件、强制推送、改写历史、生产部署、远程资源删除等操作，执行前必须再次确认范围、影响和恢复方式。

## 交付要求

完成任务后简要说明：

- 修改内容与涉及文件。
- 实际执行的检查或测试。
- 未验证事项、兼容性风险或部署前待确认项。

除非用户明确要求，不创建子项目级 `AGENTS.md` 或 `README.md`。需要补充说明时更新根目录文档，或使用项目现有的 `docs/`、源码注释和配置文件。
