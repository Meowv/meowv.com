# Meowv Projects

Blog、Studio、Wallpapers 和 livewall 位于同一仓库，但各自独立，不是统一 workspace。Blog 与 Studio 是静态站点；Wallpapers 生成站点和 livewall 使用的数据；livewall 是 macOS 原生视频壁纸 App。构建在本机完成，根脚本将产物汇总到 `build/`。

## 项目概览

| 项目 | 用途与文档 | 线上地址 |
| --- | --- | --- |
| `blog/` | Hexo 博客：[README](./blog/README.md) · [协作约定](./blog/AGENTS.md) | [meowv.com](https://meowv.com) |
| `studio/` | 浏览器本地工具，包含 Zitie：[README](./studio/README.md) · [协作约定](./studio/AGENTS.md) | [studio.meowv.com](https://studio.meowv.com)，Zitie 为 [/zitie/](https://studio.meowv.com/zitie/) |
| `wallpapers/` | Python 壁纸采集与目录导出：[README](./wallpapers/README.md) · [协作约定](./wallpapers/AGENTS.md) | 仅本地处理 |
| `livewall/` | Swift 视频动态壁纸：[README](./livewall/README.md) · [协作约定](./livewall/AGENTS.md) | 本机 App |
| `xiaomiCamera/` | 小米摄像头服务：[README](./xiaomiCamera/README.md) | 随 Studio 部署目录上传 |

跨项目修改边界见[仓库协作指南](./AGENTS.md)。根目录的 `run.sh`、`build.sh` 和 `deploy.sh` 分别负责启动、构建汇总与上传；各子项目的独立命令以其 README 为准。

## 环境与依赖

| 项目 | 环境 | 首次安装 |
| --- | --- | --- |
| Blog | Node.js、Yarn | `cd blog && yarn install --frozen-lockfile` |
| Studio | Node.js `>=22.12.0`、`studio/package.json` 指定版本的 pnpm | `cd studio && pnpm install --frozen-lockfile` |
| Wallpapers | Python `>=3.12`；运行时只用标准库 | 无需安装；测试依赖见[项目 README](./wallpapers/README.md) |
| livewall | macOS、Xcode Command Line Tools | `swift --version` 检查工具链；无需完整 Xcode |

请在目标项目目录安装依赖，不在仓库根目录安装或混用包管理器。依赖版本、脚本和测试命令以各项目清单及 README 为准。

## 根目录脚本

无参数或单独传 `all` 时，`run.sh` 和 `build.sh` 处理 Blog、Studio、livewall、xiaomiCamera；`wallpapers` 需要显式指定。支持 `blog`/`b`、`studio`/`s`、`livewall`/`lw`、`xiaomiCamera`/`xc`、`wallpapers`/`w` 简写；前两个脚本可接收多个项目并去重。

### 启动

```bash
./run.sh                 # 并行启动 Blog、Studio、livewall
./run.sh b s             # 只启动 Blog 与 Studio
./run.sh w               # Wallpapers，默认执行 crawl
./run.sh w stats         # 也支持 crawl、publish、check 及其 CLI 参数
./run.sh xiaomiCamera    # 启动摄像头服务：http://localhost:5189
```

Blog 固定使用 `http://localhost:4000`，Studio 固定使用 `http://localhost:4001`，Zitie 在 Studio 的 `/zitie/`。启动前脚本会结束占用这两个端口的监听进程；并行运行时按 `Ctrl+C` 停止本次启动的项目。脚本不会自动安装依赖。

### 构建

```bash
./build.sh                         # 构建 Blog、Studio、livewall
./build.sh blog studio             # 按参数顺序构建指定项目
./build.sh wallpapers             # 只生成壁纸目录，不构建项目
./build.sh studio --with-wallpapers
./build.sh livewall --with-dmg
./build.sh xiaomiCamera                  # 默认构建 win-x64
./build.sh xiaomiCamera --rid linux-x64  # 构建指定 RID
```

`--with-wallpapers` 只用于 Studio：构建前生成加密壁纸目录及 livewall 未加密清单。`build.sh wallpapers` 做同样的数据生成和签名；若已有 `build/studio.meowv.com/`，还会同步到该目录。内容索引与 `catalog.json.sig` 必须同批生成，签名需要本机私钥。

`--with-dmg` 只用于 livewall：额外生成 DMG、`version.json` 及其签名。根脚本的 livewall 构建会递增 `CFBundleVersion`；本地 `run.sh` 不递增。打包和签名细节见 [livewall README](./livewall/README.md)。

| 产物 | 内容 |
| --- | --- |
| `build/meowv.com/` | Blog 静态站点 |
| `build/studio.meowv.com/` | Studio，包含 `zitie/`；按构建选项包含壁纸清单和 livewall 更新文件 |
| `build/studio.meowv.com/xiaomiCamera/` | 小米摄像头服务：`<RID>/` 应用产物与共享 `tools/` FFmpeg 缓存 |
| `build/livewall/LiveWall.app/` | livewall App；此目录不由 `deploy.sh` 上传 |

全量构建在各项目都成功后才替换整个 `build/`；指定项目构建只替换对应目录。Studio 的既有 livewall 更新文件会在单独重建 Studio 时保留。`build/` 是生成目录，不提交 Git。

### 上传到 Windows Nginx

`deploy.sh` 只上传已有的 Blog、Studio 产物，不执行构建。它需要本机 `rclone`、可用的 SSH 连接及 `~/.ssh/known_hosts` 中的服务器记录。在仓库根目录创建被 Git 忽略的 `.deploy.env`：

```bash
DEPLOY_HOST='user@example.com'
DEPLOY_PORT=22
DEPLOY_PASSWORD='' # 可选：rclone obscure 的密文；留空则交互输入
```

将文件权限设为 `600`；环境变量可以覆盖同名配置。部署目标由脚本固定为 `C:\_qix\meowv.com` 和 `C:\_qix\studio.meowv.com`。摄像头服务产物会随 `studio` 同步至 `C:\_qix\studio.meowv.com\xiaomiCamera\`；执行前需与实际服务器配置核对。

```bash
./deploy.sh studio --dry-run  # 连接并预览上传、删除清单，不修改远端
./deploy.sh studio            # 上传 Studio（包括 /zitie/ 与 xiaomiCamera 服务产物）
./deploy.sh blog              # 上传 Blog
./deploy.sh all               # 上传两个站点；无参数也表示全部
```

脚本按本地 SHA-256 记录增量上传，并在上传成功后删除上次部署记录中已从本次构建消失的文件；首次部署没有旧记录，不会删除远端文件。Studio 的 `data/books/` 始终跳过，不上传也不删除，即使旧部署记录中包含书籍。远端手动放置或旧记录之外的文件不会被清理。`deploy.sh` 只负责上传文件，不负责 Windows 服务注册、重启、反向代理或 TLS 配置。上传后仍需检查线上页面和服务进程。修改生产环境前先阅读[仓库协作指南](./AGENTS.md)。
