# Meowv Projects

Meowv 的 Web 项目与桌面工具仓库，包含 Blog、Meowv Studio、Wallpapers Crawler 和 livewall。

四个顶层项目彼此独立，**不是 npm/pnpm workspace**：依赖安装、开发和构建命令都应在对应目录中执行。Blog 和 Studio 构建为静态站点，Wallpapers 负责采集并生成站点数据，livewall 是本机使用的 macOS 原生应用。

生产构建在本地完成，根目录脚本把 Blog、Studio 的静态产物及 livewall 的 App 汇总到 `build/`，再由维护者通过 `deploy.sh` 上传站点目录到 Windows Nginx 服务器，也可以手动拷贝。仓库不通过 CI 服务或托管平台构建和发布。

## 文档索引

| 文档                                                                                               | 内容                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [`blog/README.md`](./blog/README.md)、[`blog/AGENTS.md`](./blog/AGENTS.md)                         | Hexo 博客与文章                      |
| [`studio/README.md`](./studio/README.md)、[`studio/AGENTS.md`](./studio/AGENTS.md)                 | 浏览器本地工作台（含 Zitie）         |
| [`wallpapers/README.md`](./wallpapers/README.md)、[`wallpapers/AGENTS.md`](./wallpapers/AGENTS.md) | 壁纸采集器与目录发布                 |
| [`livewall/README.md`](./livewall/README.md)、[`livewall/AGENTS.md`](./livewall/AGENTS.md)         | macOS 视频动态壁纸                   |
| 本文件                                                                                             | 项目概览、环境、根目录脚本与产物映射 |
| [`AGENTS.md`](./AGENTS.md)                                                                         | 全仓库协作约定                       |

**同一事实只在一处维护**：项目自身的用途、结构与命令写在各自的 `README.md`，修改边界与验证要求写在各自的 `AGENTS.md`，本文件只保留跨项目的概览与根目录脚本。

## 推荐阅读顺序

1. 先看本文件的「环境与依赖」和「根目录脚本」，确认从哪个目录、用哪个包管理器执行命令。
2. 修改单个项目时，再读该项目的 `README.md` 和 `AGENTS.md`；前者回答“怎么运行”，后者回答“哪些地方不能动、怎么验证”。
3. 如果文档与脚本、`package.json`、`pyproject.toml` 或 SwiftPM 配置不一致，以可执行配置为准，并在本次改动范围内同步文档。

## 按任务查找

| 目标 | 从这里开始 | 说明 |
| ---- | ---------- | ---- |
| 启动 Blog / Studio / livewall | [`run.sh`](./run.sh) 或本文件「根目录脚本」 | 根脚本默认启动 Blog、Studio、livewall；Wallpapers 通过显式参数执行命令，不参与并行启动 |
| 抓取或发布壁纸数据 | [`wallpapers/README.md`](./wallpapers/README.md) | 先看数据范围，再选择 `crawl`、`publish` 或 `export-livewall` |
| 修改 Studio 功能 | [`studio/README.md`](./studio/README.md) → [`studio/AGENTS.md`](./studio/AGENTS.md) | README 说明模块与命令，AGENTS 说明边界与验证 |
| 打包或分发 livewall | [`livewall/README.md`](./livewall/README.md) | 清单签名、DMG 和版本号必须按文档顺序处理 |
| 上传线上站点 | 本文件「上传到 Windows Nginx」 | `deploy.sh` 只上传已有产物，不负责构建 |

## 项目概览

| 目录          | 项目                   | 技术栈                              | 线上地址                                     |
| ------------- | ---------------------- | ----------------------------------- | -------------------------------------------- |
| `blog/`       | 个人博客               | Hexo 7、EJS/Stylus/Pug              | [meowv.com](https://meowv.com)               |
| `studio/`     | Meowv Studio           | Vue 3、React 18、TypeScript、Vite 8 | [studio.meowv.com](https://studio.meowv.com) |
| `wallpapers/` | 壁纸接口采集与目录发布 | Python 3.12、SQLite、urllib         | 仅供本地数据处理                             |
| `livewall/`   | macOS 视频动态壁纸     | Swift、AppKit、AVFoundation         | 仅供本机使用                                 |

仓库主要文件：

```text
.
├── blog/       # 博客、文章与独立小游戏
├── studio/     # 浏览器本地工作台（含字帖应用 Zitie）
├── wallpapers/ # 公开壁纸接口采集器与 Studio 目录发布工具
├── livewall/   # macOS 视频动态壁纸工具
├── run.sh      # 开发环境启动脚本
├── build.sh    # 生产构建与产物汇总脚本
├── deploy.sh   # 上传已有构建产物到 Windows 服务器
├── nginx.conf  # 生产站点配置，部署目录与路由的参考
├── AGENTS.md   # 全仓库协作约定
└── README.md   # 本文件
```

`.deploy.env`、`.wallpaper-key`、`build/` 等属于本机配置或生成产物，不在版本控制中。

## 环境与依赖

建议使用 Node.js `>= 22.12.0`、Python `>= 3.12`。Node 版本下限取自 `studio/package.json` 的 `engines`，Blog 未声明 `engines`；如果只运行 Blog，仍应使用当前 LTS Node。首次运行前按需安装对应项目依赖：

```bash
(cd blog && yarn install --frozen-lockfile)
(cd studio && pnpm install --frozen-lockfile)
```

Wallpapers 仅使用 Python 标准库；需要使用 `wallpapers` 命令时，可直接通过 `PYTHONPATH=src` 运行，或安装为当前 Python 环境的本地命令：

```bash
(cd wallpapers && python3 -m pip install -e .)
```

Studio 固定使用 pnpm `11.9.0`，锁文件为 `studio/pnpm-lock.yaml`；Blog 使用 yarn，锁文件为 `blog/yarn.lock`。两者各自维护锁文件，**不要在仓库根目录统一安装依赖或混用包管理器**。

Wallpapers Crawler 无运行时第三方依赖，仅测试需要 `pytest`：

```bash
(cd wallpapers && python3 -m pip install -e ".[test]")
```

livewall 使用 Swift，只需要 Xcode Command Line Tools，**不需要完整 Xcode**，也不依赖 Node/pnpm。确认工具链可用：`swift --version`。由于本机未安装完整 Xcode，`XCTest` 与 `Swift Testing` 都不可用，livewall 的测试改用自建的断言运行器实现，详见 [`livewall/README.md`](./livewall/README.md)。

## 根目录脚本

脚本面向 macOS Bash，并已保留可执行权限。若权限在文件传输后丢失：

```bash
chmod +x run.sh build.sh deploy.sh
```

### 启动

不传参数或单独传入 `all` 时，并行启动全部项目：

```bash
./run.sh
./run.sh all
```

也可以传入一个或多个项目，参数支持全称和简写；重复参数会自动去重：

```bash
./run.sh blog          # 等同于 ./run.sh b
./run.sh studio        # 等同于 ./run.sh s，包含 /zitie/
./run.sh livewall      # 启动 macOS 动态壁纸 App
```

壁纸脚本也可以通过 `run.sh` 调用。未指定子命令时默认执行增量抓取，后面的参数会传递给 Wallpapers CLI：

```bash
./run.sh w
./run.sh wallpapers --device desktop --content dynamic
./run.sh w crawl --category 风景 --keyword 雨夜 --max-pages 2
./run.sh w publish
./run.sh w stats
./run.sh w check
```

| 参数               | 本地地址                                    |
| ------------------ | ------------------------------------------- |
| `blog` / `b`       | `http://localhost:4000`                     |
| `studio` / `s`     | `http://localhost:4001`，Zitie 为 `/zitie/` |
| `livewall` / `lw`  | 启动 macOS 动态壁纸 App                     |
| `wallpapers` / `w` | 执行壁纸抓取或数据命令                      |

脚本不会自动安装依赖。启动前会检查固定端口，并停止占用端口的本机进程；运行前请确认这些进程可以结束。并行启动后，按 `Ctrl+C` 会停止本次启动的全部开发服务器。

### 构建

构建参数与启动脚本相同：

```bash
./build.sh
./build.sh all
./build.sh blog
./build.sh studio
./build.sh livewall
```

只生成壁纸目录时，不需要执行 Studio 构建：

```bash
./build.sh wallpapers
./build.sh w
```

该命令的行为：

- 从 `wallpapers/wallpapers.db` 重新生成并加密 `studio/public/data/`。
- 如果 `build/studio.meowv.com/` 已存在，同步更新其中的 `data/` 目录，便于直接部署已有产物。
- 同时生成 livewall 客户端使用的未加密清单目录 `studio/public/data/livewall/`（`catalog.json` 索引 + `category.<id>.json` 分类切片），并用本机私钥给索引签名（产出 `catalog.json.sig`）。**签名失败会中止构建** —— 私钥不在本机时这一步过不去。细节见 [`livewall/README.md`](./livewall/README.md) 的「内容清单与签名」。

两个开关只能与指定项目搭配使用：

- `--with-wallpapers` 只能与 `studio` 一起使用。
- `--with-dmg` 只能与 `livewall` 一起使用：在 `.app` 之外额外打出 DMG，并对 `version.json` 做 Ed25519 签名（产出 `version.json.sig`），三者一起输出到 `build/studio.meowv.com/data/livewall/`（客户端更新接口就指向该目录，可直接部署）。**签名需要本机私钥 `~/.livewall-signing/version-key.txt`，且 `version.json` 与 `version.json.sig` 必须同一次上传** —— 少一个客户端就永远看不到更新，而症状与「线上没发新版」无法区分。细节见 [`livewall/README.md`](./livewall/README.md) 的「更新清单签名」。
- `./build.sh livewall` 会顺带递增 livewall 的 `CFBundleVersion`（内部调 `livewall/build.sh --bump-build`）。**这是发布路径专有的行为**：本地 `./run.sh lw` 走的是 `livewall/run.sh`，不传该旗标，因此不会改到源 `Info.plist`。细节见 [`livewall/README.md`](./livewall/README.md) 的「发版步骤」。

产物映射如下：

```text
build/
├── meowv.com/        # blog/public/
├── studio.meowv.com/ # studio/dist，包含 zitie/
│   └── data/livewall/  # 壁纸清单 catalog.json + catalog.json.sig + category.<id>.json
│                       # （加 --with-dmg 时还有 LiveWall-<版本>.dmg + version.json + version.json.sig）
└── livewall/         # livewall/build，只含 LiveWall.app
```

发布策略：

- 全量构建在 Blog 和 Studio 全部成功后，整体替换 `build/`。
- 指定项目构建按参数顺序执行，只替换对应域名目录，保留其他产物。
- Studio 的一次 Vite 多入口构建会同时输出 Vue 应用和 `dist/zitie/`。

### 上传到 Windows Nginx

服务器需已安装并启动 OpenSSH Server，且可以通过 `ssh` 登录。本机需安装 `rclone`。`deploy.sh` 通过 SFTP 上传已有构建产物，不执行构建。

首次使用需要在仓库根目录手动新建本机配置文件 `.deploy.env`（脚本只读取该文件，仓库不提供示例文件；它已被 `.gitignore` 排除），按需填写：

```bash
DEPLOY_HOST='administrator@服务器地址'
DEPLOY_PORT=22
# 可选，填写 rclone obscure 生成的密文；留空则每次询问
DEPLOY_PASSWORD=''
```

`DEPLOY_HOST` 必须是已经成功用 `ssh` 连接过的 `user@host`。环境变量优先于配置文件。该配置是本机敏感文件，请限制为当前用户可读（`chmod 600 .deploy.env`），更推荐改用 SSH 密钥认证。脚本会使用 `~/.ssh/known_hosts` 校验服务器身份。

生成 rclone 密文：

```bash
rclone obscure '你的 SSH 密码'
```

将输出填入 `DEPLOY_PASSWORD`。不要填明文密码；留空时脚本会按需询问。

```bash
./deploy.sh studio --dry-run # 连接服务器，预览需要上传的文件
./deploy.sh studio           # 上传 Studio（包含 /zitie/）
./deploy.sh blog             # 上传博客
./deploy.sh all              # 顺序上传博客、Studio；无参数也是全部
./deploy.sh b s              # 支持项目简写和去重
```

命令执行后默认直接上传，不再要求输入确认。`--dry-run` 会连接服务器并比较文件，但不实际上传。

| 项目   | 本地产物                  | 服务器站点目录             |
| ------ | ------------------------- | -------------------------- |
| Blog   | `build/meowv.com/`        | `C:\_qix\meowv.com`        |
| Studio | `build/studio.meowv.com/` | `C:\_qix\studio.meowv.com` |

目录取自仓库 `nginx.conf`；部署前确认服务器实际使用同一配置。

- 脚本在本机 `.deploy-cache/` 保存上次成功上传的 SHA-256 清单，只把新增或内容变化的文件交给 SFTP，内容相同的文件会跳过。
- 首次运行会上传全部文件；如果服务器文件曾被手工修改，移除对应清单后再运行即可强制重新上传全部文件。
- 脚本关闭远程修改时间同步，以兼容 Windows OpenSSH 的 `SetModTime failed`。
- 上传使用 `rclone copy`，不会清空目标目录，因此旧构建留下、而新构建不再包含的文件仍会保留。
- 脚本不提供备份、回滚、页面校验或 Nginx 重启。

## 本地处理与生成内容

Studio 和 Zitie 均以浏览器本地处理为核心。用户选择的文件、图片和附件不得上传，也不得把其内容或敏感文件信息写入日志、统计信息、Cookie、URL 或远程数据库，不执行不受信任的主动内容。新增上传、远程转换、遥测、外部服务或权限前，必须先说明影响并取得授权。

依赖安装、开发或构建过程生成的目录与文件（`node_modules/`、`build/`、`blog/public/`、`studio/dist/`、`wallpapers/wallpapers.db`、`livewall/build/`、`livewall/.build/` 等）不应手工修改或提交，`.gitignore` 已逐项排除。按项目划分的完整清单见 [`AGENTS.md` 的安全与清理](./AGENTS.md#安全与清理)。

生产部署、Nginx 修改、域名切换、`yarn deploy` 和远程资源操作均不属于日常本地开发步骤，需要单独确认。具体协作与验证规则见 [`AGENTS.md`](./AGENTS.md)。
