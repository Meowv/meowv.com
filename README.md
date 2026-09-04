# Meowv Projects

Meowv 的 Web 项目与壁纸数据工具仓库，包含 Blog、Meowv Studio 和 Wallpapers Crawler。各顶层项目彼此独立，不是 npm/pnpm workspace；依赖安装、开发和构建命令都应在对应目录中执行。

生产构建在本地完成，根目录脚本会把静态产物汇总到 `build/`，再由维护者自行部署。仓库不通过 GitHub Actions、OpenAI Sites 或其他托管平台构建和发布。

## 项目概览

| 目录          | 项目                   | 技术栈                            | 线上地址                                     |
| ------------- | ---------------------- | --------------------------------- | -------------------------------------------- |
| `blog/`       | 个人博客与 Labs 工具   | Hexo 7、EJS、Stylus               | [meowv.com](https://meowv.com)               |
| `studio/`     | Meowv Studio           | Vue 3、React 18、TypeScript、Vite | [studio.meowv.com](https://studio.meowv.com) |
| `wallpapers/` | 壁纸接口采集与目录发布 | Python 3.12、SQLite、urllib       | 仅供本地数据处理                             |

```text
.
├── blog/       # 博客、文章、独立游戏和 Labs 工具
├── studio/     # 浏览器本地工作台
├── wallpapers/ # 公开壁纸接口采集器与 Studio 目录发布工具
├── run.sh      # 开发环境启动脚本
├── build.sh    # 生产构建与产物汇总脚本
├── AGENTS.md   # 全仓库协作约定
└── README.md   # 项目说明
```

## 环境与依赖

建议使用 Node.js `>= 22.13.0`、Python `>= 3.12`，同时安装各项目对应的包管理器。首次运行前分别安装依赖：

```bash
(cd blog && yarn install --frozen-lockfile)
(cd studio && pnpm install --frozen-lockfile)
```

Studio 固定使用 pnpm `11.9.0`。Blog 和 Studio 各自维护锁文件，不要在仓库根目录统一安装依赖或混用包管理器。

Wallpapers Crawler 无运行时第三方依赖；运行测试时需要 `pytest`，可在 `wallpapers/` 中按需安装测试依赖：

```bash
(cd wallpapers && python3 -m pip install -e ".[test]")
```

## 根目录脚本

脚本面向 macOS Bash，并已保留可执行权限。若权限在文件传输后丢失，可执行：

```bash
chmod +x run.sh build.sh
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
| `wallpapers` / `w` | 执行壁纸抓取或数据命令                      |

脚本不会自动安装依赖。启动前会检查固定端口，并停止占用端口的本机进程；运行前请确认这些进程可以结束。并行启动后，按 `Ctrl+C` 会停止本次启动的全部开发服务器。

### 构建

构建参数与启动脚本相同：

```bash
./build.sh
./build.sh all
./build.sh blog
./build.sh studio
```

只生成壁纸目录时，不需要执行 Studio 构建：

```bash
./build.sh wallpapers
./build.sh w
```

该命令先从 `wallpapers/wallpapers.db` 更新并加密 `studio/public/data/`；如果 `build/studio.meowv.com/` 已存在，还会同步更新其中的 `data/` 目录，便于直接部署构建产物。`--with-wallpapers` 只能与 `studio` 一起使用。

产物映射如下：

```text
build/
├── meowv.com/        # blog/public/
└── studio.meowv.com/ # studio/dist/，包含 zitie/
```

全量构建会在 Blog 和 Studio 全部成功后替换整个 `build/`。指定项目构建会按参数顺序执行，只替换对应域名目录并保留其他产物。Studio 的一次 Vite 多入口构建会同时输出 Vue 应用和 `dist/zitie/`。

## 单项目命令

### Blog

```bash
cd blog
yarn server
yarn clean && yarn build
```

- 内容：`source/`
- 文章：`source/_posts/`
- Labs 注册：`source/_data/tools.json`
- Labs 页面：`source/tools/<slug>/index.md`
- Labs 模板：`themes/hexo-theme-matery/layout/tools/<slug>.ejs`
- 构建产物：`public/`

### Meowv Studio

```bash
cd studio
pnpm dev
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
pnpm preview
```

功能模块位于 `src/features/`，共享组件与组合式逻辑位于 `src/components/` 和 `src/composables/`，浏览器与本地隐私基础能力位于 `src/core/`。构建产物为 `dist/`。

### Zitie

Zitie 是 Studio Vite 中独立的 React 多页面应用，线上地址为 [studio.meowv.com/zitie/](https://studio.meowv.com/zitie/)。源码位于 `studio/src/features/zitie/`，唯一 HTML 模板为 `studio/zitie.html`，字体和品牌资源位于 `studio/public/zitie/`。它与 Studio Vue 应用使用不同 HTML 入口，不加载 `StudioShell` 或 Studio CSS。

开发时直接启动 Studio 并访问 `http://localhost:4001/zitie/`。Vite 根据 pathname 从同一模板动态渲染各页面；生产构建再自动生成目录式 HTML。笔顺 JSON 由 Vite 从 `hanzi-writer-data` 依赖按请求返回，不需要预先同步；生产构建会自动复制到 `studio/dist/zitie/hanzi-data/` 并校验页面和关键资源。

### Wallpapers Crawler

```bash
cd wallpapers
PYTHONPATH=src python3 -m wallpapers crawl
PYTHONPATH=src python3 -m wallpapers stats
PYTHONPATH=src python3 -m wallpapers check
PYTHONPATH=src python3 -m wallpapers publish --db wallpapers.db --output-dir ../studio/public/data
```

采集器只保存公开接口返回的元数据和 CDN 地址，不下载媒体文件。`crawl` 默认使用 `incremental` 模式；支持 `quick`、`incremental`、`full`，以及 `--device`、`--content`、`--category`、`--keyword`、`--max-pages` 等过滤参数。`publish` 从 SQLite 生成 catalog、bootstrap 和 manifest；部署前由 `./build.sh wallpapers` 或 `./build.sh studio --with-wallpapers` 将 catalog 与 bootstrap 加密为版本化 `.bin`，公开的 `wallpapers.catalog.json` 仅保留 manifest。

壁纸采集器的完整参数、数据库表结构和发布说明见 [`wallpapers/README.md`](./wallpapers/README.md)。

## 本地处理与生成内容

Studio 和 Zitie 均以浏览器本地处理为核心。用户选择的文件、图片和附件不得上传，也不得把其内容或敏感文件信息写入日志、统计信息、Cookie、URL 或远程数据库，不执行不受信任的主动内容。新增上传、远程转换、遥测、外部服务或权限前，必须先说明影响并取得授权。

下列内容由依赖安装、开发或构建过程生成，不应手工修改或提交：

- 通用：`node_modules/`、`.DS_Store`、根目录 `build/` 与临时构建目录
- Blog：`public/`、`db.json`
- Studio：`dist/`、`dist/zitie/hanzi-data/`、壁纸背景素材、`public/data/wallpapers.catalog.json` 及版本化 `.bin`
- Wallpapers：`wallpapers.db`、Python 缓存和 `.venv/`

生产部署、Nginx 修改、域名切换、`yarn deploy` 和远程资源操作均不属于日常本地开发步骤，需要单独确认。仓库没有统一许可证，使用、分发或二次开发前应分别确认各项目的授权情况。具体协作与验证规则见 [AGENTS.md](./AGENTS.md)。
