# 仓库协作指南

## 适用范围与信息来源

本文件适用于根目录及 `blog/`、`studio/`、`wallpapers/`、`livewall/`，记录**跨项目共有**的修改边界、协作规则和根目录脚本约定。

每个子项目另有自己的两份文档，**本文件不复述其中的内容**：

| 目录          | 用途、结构与命令       | 修改边界、约定与验证   |
| ------------- | ---------------------- | ---------------------- |
| `blog/`       | `blog/README.md`       | `blog/AGENTS.md`       |
| `studio/`     | `studio/README.md`     | `studio/AGENTS.md`     |
| `wallpapers/` | `wallpapers/README.md` | `wallpapers/AGENTS.md` |
| `livewall/`   | `livewall/README.md`   | `livewall/AGENTS.md`   |

根目录 `README.md` 记录项目概览、环境、根目录脚本与产物映射。

四条通用原则：

- **同一事实只在一处维护**。需要重复提及时，另一处只写指针链接，不复述内容。新增或修改文档前先判断归属，避免两份文档各存一份副本后逐渐漂移。
- **实际脚本、`package.json`、锁文件与源码配置是可执行行为的最终依据**；发现文档不一致时，应在任务范围内同步修正。
- **清单类内容不凭记忆抄写**。工具清单、路由表、分类数这类会漂移的事实，文档里只写「去哪读」，不复制具体条目；确需写数字时先回到源码核对。
- 涉及命令、端口、产物路径时以对应项目文档为准。

四个目录是同一 Git 仓库中的独立项目，不是统一 workspace。执行命令前先进入目标目录，并使用该项目现有的包管理器、运行时和代码风格。`blog/`、`studio/` 是 Web 项目（Node），`wallpapers/` 是 Python 项目，`livewall/` 是原生 Swift 项目，运行时互不相干。

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

## 安全与清理

- 不输出或提交真实 API 密钥、令牌、密码、证书、个人文件内容或其他敏感信息；示例使用环境变量或明确占位符。
- 本机敏感配置包括根目录 `.deploy.env`（部署凭据）和 `.wallpaper-key`（壁纸加密密钥），以及仓库外的 `~/.livewall-signing/version-key.txt`（更新清单签名私钥）。三者均不提交 Git，不要在源码、日志或文档中写入其内容，也不要引入新的密钥材料。
- 不提交 `node_modules/`、构建目录、测试报告、覆盖率目录、`*.tsbuildinfo`、`.DS_Store` 或 `.gitignore` 已排除的内容。
- 清理前先区分源码、配置、依赖、缓存、构建产物和用户本地数据；列出拟删除目标及依据，不确定用途时先查引用和 Git 历史。
- 批量删除、覆盖重要文件、强制推送、改写历史、生产部署、远程资源删除等操作，执行前必须再次确认范围、影响和恢复方式。

下列内容由依赖安装、开发或构建过程生成，不应手工修改或提交（`.gitignore` 已逐项排除）：

- 通用：`node_modules/`、`.DS_Store`、根目录 `build/`、暂存目录与备份目录。
- Blog：`public/`、`db.json`。
- Studio：`dist/`、`dist/zitie/hanzi-data/`、`public/data/wallpapers.catalog.*` 与 `public/data/livewall/`（整目录）。
- Wallpapers：`wallpapers.db`、Python 缓存和 `.venv/`。
- livewall：`build/` 与 `.build/`。

各项目的边界与额外约定（例如哪些生成物由哪个脚本产出、哪些文件属外部设计资产）写在各自的 `AGENTS.md` 里。

## 根目录脚本约定

`run.sh`、`build.sh`、`deploy.sh` 是本文件唯一负责的脚本；子项目目录内的脚本（`livewall/build.sh` 等）由各自文档说明。

- `run.sh` 和 `build.sh` 必须同时支持无参数、独占的 `all`、一个或多个项目参数，以及 `blog`/`b`、`studio`/`s`、`livewall`/`lw` 简写。
- `run.sh` 的 `wallpapers`/`w` 分支执行 Wallpapers CLI，默认子命令为 `crawl`；支持 `crawl`、`publish`、`stats`、`check`，其余参数原样传递。
- 固定开发端口为 Blog `4000`、Studio `4001`；Zitie 由 Studio 的 `/zitie/` 多页面入口提供，不另启端口。
- `run.sh` 并行启动多个项目，并统一处理退出；修改端口清理逻辑时，不得扩大终止进程的范围。
- `build.sh` 按参数顺序构建。全量构建必须全部成功后再替换 `build/`；指定项目构建只替换对应域名目录。
- 汇总目录固定为 `build/meowv.com/`、`build/studio.meowv.com/`、`build/livewall/`。Studio 产物包含 `dist/zitie/`；livewall 产物为 `build/livewall/LiveWall.app/`。
- 保持 macOS Bash 3.2 兼容性，不使用 `mapfile`、关联数组等 4.0+ 特性。Bash 3.2 在 `set -u` 下展开空数组会报 `unbound variable`，遍历前先使用 `${SELECTED_PROJECTS[*]:-}` 防护。
- 所有 shell 脚本中，变量后紧跟中文或全角字符时一律写成 `${VAR}`。非 `C` locale 下 bash 会把紧随其后的多字节字符首字节并入变量名（`$APP（` 被解析为变量名 `APP\xef`），`set -u` 下直接报 `unbound variable` 并使脚本中断。`LC_ALL=C` 的环境（例如某些沙箱）测不出这个问题，本地跑通不代表对用户的终端成立。
  **适用范围是仓库内所有 shell 脚本，包括各子项目目录** —— 这一节标题里的「根目录」只是它的所在位置，不是适用范围。2026-09-18 新写的 `livewall/make-dmg.sh` 就因为按标题把它理解成「只管根目录」而漏掉这条、重新踩了一次（`$DMG_PATH（` / `$SIZE）` / `$APP_BUNDLE（` 三处）。**新写或改动脚本后跑一遍扫描器与多 locale 运行器**（技能 `shell-locale-safety` 里有：`scan_dollar_nonascii.py <目录>` 与 `run_under_locales.sh <脚本>`）—— `bash -n` 查不出这个问题。
- `build/`、暂存目录和备份目录均为可替换生成内容，不提交 Git。
- `build.sh wallpapers` 只生成并加密 Studio 壁纸目录，不构建项目；`./build.sh studio --with-wallpapers` 仅允许与 `studio` 一起使用，并在 Studio 构建前生成目录数据。两者都会同时生成供 livewall 使用的未加密清单目录 `studio/public/data/livewall/`，并同步到 `build/studio.meowv.com/data/livewall/`。清单索引在导出后**立即由 `sign_livewall_catalog` 签名**（需本机私钥，失败即中止构建），所以 `catalog.json` 与 `catalog.json.sig` 是同一次产出的，不能只留其一。
- `./build.sh livewall --with-dmg`（别名同样支持 `lw`）仅允许与 `livewall` 一起使用：在 `.app` 打完后跑 `livewall/make-dmg.sh --no-build`。`build/livewall/` **只放 `LiveWall.app`**；DMG 与 `version.json` 由 `install_livewall_update_feed` 在**发布之后**写进 `build/studio.meowv.com/data/livewall/` —— 客户端的 `fileURL` 指向 `https://studio.meowv.com/data/livewall/`，而 `deploy.sh` 只上传 `build/studio.meowv.com/`，放 `build/livewall/` 等于发不出去。
  - 版本号、文件名、sha256、fileURL 全部由 `make-dmg.sh` 从 `Info.plist` 生成，根目录 `build.sh` 只搬运（清旧 → 拷贝 → 核一遍 `version.json` 的 `fileURL` 与 dmg 文件名一致），**不另生成一份**。
  - 两条坑：① DMG 必须在 `publish_*` **之后**才装，否则会被整体替换掉的目录覆盖；② 清 `build/studio.meowv.com/data/livewall/` 时只能删 `catalog.json` / `catalog.json.sig` / `category.*.json`，`version.json` 与 `version.json.sig` 是分发产物不能跟着删。**两份签名必须各自跟着自己的清单一起走**：`catalog.json.sig` 与新清单同批（旧索引配旧签名 = 客户端报「签名与清单不符」，人只会去怀疑密钥），`version.json.sig` 与 `version.json` 同批（这条见下一条）。
  - 只跑 `./build.sh studio` 也不会丢分发产物：`preserve_livewall_update_feed` 在 studio 产物拷进暂存区**之后**，把现有 `data/livewall/` 里的 dmg 与 `version.json` 一起带过去（顺序反了会被 `cp -R` 覆盖）。带 `--with-dmg` 时不冲突 —— `install_livewall_update_feed` 稍后清掉旧 dmg 再放新的。
- 修改脚本时，同步检查参数帮助、项目数组、别名、端口、依赖检查、启动或构建分支、源目录和目标目录，避免只更新其中一处。

## 验证与交付

- 优先执行与改动直接相关的轻量检查，例如语法、格式、类型检查、定向测试或 `git diff --check`。各项目的具体检查命令见其 `AGENTS.md`。
- 除非用户明确要求，不主动执行完整编译、完整构建、全量测试或端到端测试；只有完整构建才能可靠验证时，先说明原因并征得同意。
- 界面或交互改动不能只凭静态检查判定完成；条件允许时启动目标项目，检查实际页面、关键交互、窄屏布局、控制台和异常路径。
- 将语法、类型、Lint、构建、浏览器、部署和生产验证视为不同证据层级，只报告实际执行过的检查。

完成任务后简要说明：

- 修改内容与涉及文件。
- 实际执行的检查或测试。
- 未验证事项、兼容性风险或部署前待确认项。

## 文档维护

- 新增顶层项目时，同步更新根 `README.md` 的项目概览表与目录树、本文件的子项目文档表、根脚本的项目数组与别名、`nginx.conf` 与 `deploy.sh` 的目标目录，以及两个根脚本的参数帮助。
- 归属判断：**用途 / 结构 / 命令** 写进子项目 `README.md`；**修改边界 / 约定 / 验证要求** 写进子项目 `AGENTS.md`；**跨项目共有的规则** 写进本文件；**概览 / 环境 / 根脚本 / 产物映射** 写进根 `README.md`。
- 新建子项目文档时保持与现有文档相同的写法：简体中文，代码与路径保留原文，表格优先于长段落，不写示例文件。
