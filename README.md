# Meowv Projects

Meowv 的 Web 项目与桌面工具仓库，包含 Blog、Meowv Studio、Wallpapers Crawler 和 livewall。各顶层项目彼此独立，不是 npm/pnpm workspace；依赖安装、开发和构建命令都应在对应目录中执行。前三者构建为静态站点，livewall 是本机使用的 macOS 原生应用，不参与站点构建与部署。

生产构建在本地完成，根目录脚本会把静态产物汇总到 `build/`，再由维护者通过 `deploy.sh` 上传到 Windows Nginx 服务器，也可以手动拷贝。仓库不通过 CI 服务或托管平台构建和发布。

## 目录

- [项目概览](#项目概览)
- [环境与依赖](#环境与依赖)
- [根目录脚本](#根目录脚本)
  - [启动](#启动)
  - [构建](#构建)
  - [上传到 Windows Nginx](#上传到-windows-nginx)
- [单项目说明](#单项目说明)
  - [Blog](#blog)
  - [Meowv Studio](#meowv-studio)
    - [功能菜单](#功能菜单)
      - [Markdown](#markdown)
      - [Office](#office)
      - [Books](#books)
      - [Whiteboard](#whiteboard)
      - [Mermaid](#mermaid)
      - [Mind](#mind)
      - [Notes](#notes)
      - [Wallpapers](#wallpapers)
      - [Tools](#tools)
    - [日历工具](#日历工具)
    - [三方组件清单](#三方组件清单)
  - [Zitie](#zitie)
  - [Wallpapers Crawler](#wallpapers-crawler)
  - [livewall](#livewall)
- [本地处理与生成内容](#本地处理与生成内容)

## 项目概览

| 目录          | 项目                   | 技术栈                              | 线上地址                                     |
| ------------- | ---------------------- | ----------------------------------- | -------------------------------------------- |
| `blog/`       | 个人博客与 Labs 工具   | Hexo 7、EJS/Stylus/Pug              | [meowv.com](https://meowv.com)               |
| `studio/`     | Meowv Studio           | Vue 3、React 18、TypeScript、Vite 8 | [studio.meowv.com](https://studio.meowv.com) |
| `wallpapers/` | 壁纸接口采集与目录发布 | Python 3.12、SQLite、urllib         | 仅供本地数据处理                             |
| `livewall/`   | macOS 视频动态壁纸     | Swift、AppKit、AVFoundation         | 仅供本机使用                                 |

仓库主要文件：

```text
.
├── blog/       # 博客、文章、独立游戏和 Labs 工具
├── studio/     # 浏览器本地工作台
├── wallpapers/ # 公开壁纸接口采集器与 Studio 目录发布工具
├── livewall/   # macOS 视频动态壁纸工具
├── run.sh      # 开发环境启动脚本
├── build.sh    # 生产构建与产物汇总脚本
├── deploy.sh   # 上传已有构建产物到 Windows 服务器
├── nginx.conf  # 生产站点配置，部署目录与路由的参考
├── AGENTS.md   # 全仓库协作约定
└── README.md   # 项目说明
```

`.deploy.env`、`.wallpaper-key`、`build/` 等属于本机配置或生成产物，不在版本控制中。

## 环境与依赖

建议使用 Node.js `>= 22.12.0`、Python `>= 3.12`，同时安装各项目对应的包管理器。Node 版本下限取自 `studio/package.json` 的 `engines`，Blog 未声明 `engines`。首次运行前分别安装依赖：

```bash
(cd blog && yarn install --frozen-lockfile)
(cd studio && pnpm install --frozen-lockfile)
```

Studio 固定使用 pnpm `11.9.0`，锁文件为 `studio/pnpm-lock.yaml`；Blog 使用 yarn，锁文件为 `blog/yarn.lock`。两者各自维护锁文件，不要在仓库根目录统一安装依赖或混用包管理器。

Wallpapers Crawler 无运行时第三方依赖；运行测试时需要 `pytest`，可在 `wallpapers/` 中按需安装测试依赖：

```bash
(cd wallpapers && python3 -m pip install -e ".[test]")
```

livewall 使用 Swift，只需要 Xcode Command Line Tools，**不需要完整 Xcode**，也不依赖 Node/pnpm。确认工具链可用：

```bash
swift --version
```

需要注意：由于本机未安装完整 Xcode，`XCTest` 与 `Swift Testing` 都不可用，livewall 的测试改用自建的断言运行器实现，详见 [`livewall/README.md`](./livewall/README.md)。

## 根目录脚本

脚本面向 macOS Bash，并已保留可执行权限。若权限在文件传输后丢失，可执行：

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

该命令的行为：

- 从 `wallpapers/wallpapers.db` 重新生成并加密 `studio/public/data/`。
- 如果 `build/studio.meowv.com/` 已存在，同步更新其中的 `data/` 目录，便于直接部署已有产物。
- 同时生成 livewall 客户端使用的未加密清单目录 `studio/public/data/livewall/`（`catalog.json` 索引 + `category.<id>.json` 分类切片）。
- `--with-wallpapers` 只能与 `studio` 一起使用。

产物映射如下：

```text
build/
├── meowv.com/        # blog/public/
└── studio.meowv.com/ # studio/dist/，包含 zitie/
```

发布策略：

- 全量构建在 Blog 和 Studio 全部成功后，整体替换 `build/`。
- 指定项目构建按参数顺序执行，只替换对应域名目录，保留其他产物。
- Studio 的一次 Vite 多入口构建会同时输出 Vue 应用和 `dist/zitie/`。

### 上传到 Windows Nginx

服务器需已安装并启动 OpenSSH Server，且可以通过 `ssh` 登录。本机需安装 `rclone`。`deploy.sh` 通过 SFTP 上传已有构建产物，不执行构建。

首次使用需要在仓库根目录手动新建本机配置文件 `.deploy.env`（脚本只读取该文件，仓库不提供示例文件；它已被 `.gitignore` 排除，不纳入版本控制），按需填写以下变量：

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

## 单项目说明

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

#### 功能菜单

左侧导航在 `src/layouts/StudioShell.vue` 的 `primaryRoutes` 中集中声明，共 9 项；路由与页面元数据位于 `src/router/index.ts`。首页 `/` 是统一文件入口，支持拖放文件和粘贴图片，再按格式交接给对应模块；其余菜单各自独立路由并按需加载，首页不预载重型编辑器或 WASM。

##### Markdown

- 功能定位：浏览器本地 Markdown 工作台，把本机文件夹当作工作空间，写作、预览、检索与导出都在设备内完成。
- 主要用途：打开目录并扫描文件树，编辑并实时预览 Markdown，解析 Front Matter、Wiki 链接与相对路径图片，做本地全文搜索，导出 Markdown、HTML、PDF、PNG 和 Word。
- 子模块与入口：路由 `/markdown`；页面 `MarkdownStudioPage.vue` 与工作区 `MarkdownWorkspace.vue` 位于 `src/features/markdown/`；界面组件按职责分在 `components/` 下的编辑器、文件树、预览、侧栏、布局与反馈目录；能力封装在 `services/`，覆盖目录读写与权限、Markdown 解析、检索、链接与知识库、图片与媒体、导出和本地存储；全文索引在 `workers/search.worker.ts` 中构建，工作区状态在 `stores/workspace.ts`。

##### Office

- 功能定位：浏览器本地 Office 编辑器，基于 OnlyOffice 运行时，新建、打开、编辑和保存都在本机完成。
- 主要用途：新建四类文档——文字文档（DOCX）、电子表格（XLSX）、演示文稿（PPTX）和数据表格（CSV），打开本地文件、查看最近文档，并在浏览器内完成格式转换。
- 子模块与入口：路由 `/office`，也可用 `/office/doc|xls|ppt|csv` 直接进入对应格式；页面 `OfficeStudioPage.vue`，运行时入口为 `runtime/office-controller.ts`；`runtime/lib/` 管理活动文档、编辑器会话、文件类型与最近文档，`runtime/converter/` 封装 X2T 转换与 docx 打包，`runtime/shared/` 提供文档类型、国际化与状态；编辑器与 WASM 资源位于 `public/office-assets/`。

##### Books

- 功能定位：把本地文档渲染成可翻页的仿真书，用 3D 翻页动画阅读。
- 主要用途：打开 PDF、EPUB、TXT、MOBI、AZW3、FB2 和 CBZ，支持跨页排版、书架管理、阅读进度与分页索引，也可以直接从内置书架取书。
- 子模块与入口：路由 `/books`；页面 `BooksPage.vue`；格式分发在 `publication/PublicationLoader.ts`，PDF、CBZ、TXT 各走 `publication/` 下的同名子目录，其余格式经 `publication/foliate/`；渲染引擎在 `engine/`，含 `BookEngine`、`BookStateMachine`、`BookConfig`、跨页计算 `spreads.ts`、三维辅助 `three-utils.ts`、书本模型 `engine/book/` 和翻页动画 `engine/turn/`；持久化在 `persistence/`，覆盖书架、分页索引、阅读进度、指纹与封面缩略图；页面缓存为 `cache/` 下的 `PageCache` 与 `PageSurfaceCache`；内置书架 `builtin/BuiltinShelf.ts` 读取 `public/data/books/`，开发与预览由 `vite/builtinBooksDevPlugin.ts` 提供目录索引和分段请求，目录不存在时书架为空。

##### Whiteboard

- 功能定位：基于 Excalidraw 的浏览器本地白板，用于画草图、流程图和架构图。
- 主要用途：管理多个画板并自动保存，导出 PNG、SVG 和 Excalidraw 文件；绑定本地文件句柄后可以把改动写回磁盘。
- 子模块与入口：路由 `/draw`；页面 `DrawPage.vue`；编辑器装配与交互在 `editor.ts`，样式在 `editor.css`；持久化在 `storage.ts`，使用 IndexedDB `meowv-studio-draw` 的 `documents`、`settings`、`library` 三个存储区，并封装文件系统写入权限校验。

##### Mermaid

- 功能定位：Mermaid 图表编辑器，代码编辑与可视化画布双向同步。
- 主要用途：编写并实时预览图表，套用示例，导出 PNG、JPEG、WebP、SVG、PDF、MMD 源码、Markdown 和图表文档，也可以生成分享链接。
- 子模块与入口：路由 `/mermaid`；页面 `MermaidPage.vue`；可视化层在 `visual/`，含会话 `MermaidEditingSession`、渲染与视口适配器，以及界面外壳和能力探测；服务在 `services/`，覆盖配置、导出、分享编解码与本地草稿；示例数据在 `examples.ts`。渲染任务统一经 `src/core/mermaid/scheduler.ts` 的 `enqueueMermaidTask` 串行执行。

##### Mind

- 功能定位：本地思维导图编辑器，同时支持可视化节点编辑和 Markdown 大纲两种文档形态。
- 主要用途：创建和整理导图，切换主题、方向与背景，导出 Markdown、PNG、SVG 和 JSON；Markdown 大纲与可视化结构可以相互转换。
- 子模块与入口：路由 `/mind`；页面 `MindPage.vue`；渲染适配器在 `adapters/`，分别对接 mind-elixir 与 markmap；结构转换在 `conversion.ts`，类型与默认设置在 `types.ts`；持久化在 `storage.ts`，使用 IndexedDB `meowv-studio-mind`。

##### Notes

- 功能定位：桌面便签式的速记面板，便签自由摆放、随写随存。
- 主要用途：新建彩色便签并调整位置、尺寸、层级、颜色与透明度，置顶或折叠，在编辑与预览之间切换；粘贴图片时会压缩后内嵌到便签内容中。
- 子模块与入口：路由 `/notes`；页面 `NotesPage.vue`；组件在 `components/`，含页头、卡片、编辑器与预览；Markdown 渲染在 `services/markdown.ts`，图片压缩与文字样式在 `lib/`；持久化在 `storage.ts`，使用 IndexedDB `meowv-studio-notes`。

##### Wallpapers

- 功能定位：壁纸浏览与下载页，数据来自 Wallpapers Crawler 生成并加密的目录，页面不请求业务后端。
- 主要用途：按桌面/手机与静态/动态筛选，按分类和关键词查找，分页浏览、动态预览并下载。
- 子模块与入口：路由 `/wallpapers`；页面 `WallpapersPage.vue`；数据逻辑在 `composables/useWallpapers.ts` 与 `services/wallpaperRepository.ts`；`workers/wallpapers.worker.ts` 在 Worker 中读取 `public/data/wallpapers.catalog.json`、解密对应的 `.bin` 并写入 IndexedDB `meowv-wallpapers-catalog`；数据结构在 `types.ts`。目录的生成与加密见 [Wallpapers Crawler](#wallpapers-crawler)。

##### Tools

- 功能定位：工具聚合页，把内置工具与外部链接按分类收在一处。
- 主要用途：按分类浏览、按关键词搜索、收藏常用工具；内置工具在本站本地运行，外链工具在新标签打开。
- 子模块与入口：路由 `/tools`，详情为 `/tools/<id>`；页面为 `src/features/tools/pages/ToolsHome.vue` 与详情页 `ToolDetail.vue`；`src/features/tools/tools.ts` 声明 6 个分类共 41 个内置工具；每个工具实现为 `src/features/tools/tools/<分类>/<id>/index.vue`，由 `import.meta.glob` 自动映射；外部链接与书签在运行时从 `public/data/tools-links.yaml` 加载；`components/` 提供卡片、搜索、侧边栏与背景组件，`composables/` 提供目录、收藏与偏好。首页依次呈现收藏、分类工具、书签与 AI 站点区域，其中后两者只在配置了对应数据时显示。

内置工具的 `id` 同时是路由末段和实现目录名。图片工具与 PDF 工具是薄封装，能力集中在共享层 `_shared/image/ImageTool.vue`（按 `mode`）与 `_shared/pdf/PdfTool.vue`（按 `slug`），其余工具各自实现。下面按 `tools.ts` 的声明顺序列出。

**开发工具（4）**

- JSON 编辑器（`json`）：编辑、格式化和折叠 JSON，支持 XML/YAML 粘贴转换、注释清理、压缩复制与 JS 过滤。
- 文本 / JSON 对比（`text-json-diff`）：并排对比文本或 JSON 内容，高亮显示新增、删除与修改差异。
- SQLite Online（`sqlite`）：在浏览器中打开、查询和编辑 SQLite 数据库，数据不会上传。
- 编码转换（`encoding-converter`）：支持 Base64、URL、Unicode、HTML Entity 与 Hex 编码转换。

**语言工具（4）**

- 中英翻译（`translation`）：在中文与英文之间翻译文本内容。
- 繁简互转（`simplified-traditional-converter`）：在简体中文与繁体中文之间转换。
- 汉字标准发音（`chinese-pronunciation`）：查询汉字的标准读音与拼音。
- 汉字笔顺（`chinese-stroke-order`）：查看汉字的笔画顺序与书写过程。

**图片工具（13）**

- 图片压缩（`image-compress`）：降低图片体积，保留清晰画质。
- 图片格式转换（`image-convert`）：转换 PNG、JPEG、WebP、ICO 与 SVG。
- 图片尺寸调整（`image-resize`）：按宽高、百分比或最大边批量缩放。
- 图片裁剪（`image-crop`）：自由比例、常用尺寸与精确导出。
- 图片合并（`image-merge`）：自由拖动、缩放和排列多张图片，合并导出为一张图片。
- 图片转 PDF（`images-to-pdf`）：多图排序并生成常用纸张 PDF。
- 图片添加水印（`image-watermark`）：添加文字、Logo、位置、旋转与平铺水印。
- 合并为 GIF（`merge-gif`）：设置帧率、画布、背景与循环。
- 视频转 GIF（`video-to-gif`）：截取本地视频片段，优化色彩并转换为 GIF 动图。
- PSD 查看（`psd-viewer`）：本地解析 Photoshop 合成图并导出预览。
- 图片添加圆角（`image-rounded-corners`）：统一或独立圆角，保留透明背景。
- 图片补边留白（`image-padding`）：设置四边边距、纯色、透明或渐变背景。
- 图片取色与主色提取（`image-color`）：在图片中精确取色，并提取主色调色板。

**PDF 工具（10）**

- 合并 PDF（`merge-pdf`）：按指定顺序将多个 PDF 合成一个文件。
- 拆分 PDF（`split-pdf`）：按页、范围或自定义分组拆分 PDF。
- 整理 PDF 页面（`organize-pdf`）：拖拽排序、复制、旋转或移除页面。
- PDF 转图片（`pdf-to-images`）：将 PDF 页面导出为 PNG、JPG 或 WebP。
- PDF 添加水印（`watermark-pdf`）：添加可定制的文字或图片水印。
- PDF 添加页码（`add-pdf-page-numbers`）：自定义格式、位置和范围添加页码。
- 删除 PDF 页面（`delete-pdf-pages`）：选择不需要的页面并导出新的 PDF。
- 提取 PDF 页面（`extract-pdf-pages`）：将选中页面合并或分别导出。
- 旋转 PDF（`rotate-pdf`）：旋转全部或指定页面并保存结果。
- PDF 元数据（`pdf-metadata`）：查看、编辑或清除 PDF 基础信息。

**其他工具（9）**

- 日历（`calendar`）：支持年、月、周、日视图，查看农历、中国节日和二十四节气；详细说明见下方[日历工具](#日历工具)。
- 颜色选择器（`color-picker`）：在 HEX、RGB、RGBA、HSL、HSLA、HSV 与 CMYK 之间实时转换。
- QR Code（`qr-code`）：二维码生成与识别。
- 特殊符号（`special-symbols`）：按分类查找并复制特殊符号、字符和 Emoji。
- 键盘可视化（`keyboard-visualizer`）：机械键盘按键测试、组合键展示与 RGB 灯效体验。
- 计算稿纸（`calculation-paper`）：从混合文本中提取数字并自动计算与汇总。
- 元素周期表（`periodic-table`）：交互式查看 118 个化学元素。
- 答案之书（`answer-book`）：默念一个问题，翻开书页寻找答案。
- 3D 魔方还原（`cube-solver`）：本地录入三阶魔方，校验状态并通过 3D 动画逐步完成还原。

**趣味游戏（1）**

- 表情符号消除（`emoji-match`）：在限时挑战中找出唯一成对的表情符号。

**外部链接与书签**

工具列表另有部分数据由 `public/data/tools-links.yaml` 在运行时提供，不参与构建，修改后刷新页面即可生效，条目会随之变化，因此这里不逐条列出：

- 外链工具：当前 9 条，分属 `developer` 与 `games` 两个分类，按其 `category` 追加到对应分类的末尾，点击在新标签打开。
- 书签：当前 38 条，覆盖字帖生成、在线 PS、影视与热榜导航等，在页面上以独立区域展示，不与分类混排。

#### 日历工具

`/tools/calendar` 使用本地算法计算农历、常见节日和二十四节气；休班安排由浏览器直接读取 `lanceliao/china-holiday-calender` 的 `holidayAPI.json`，备用为 `muhac/chinese-holidays-calendar` 的放假与补班 ICS。请求不携带凭据或 Referrer，不需要后端代理。上游新增年份后，刷新即可获取，不需要重新构建或手动更新 ICS。

公共数据缓存与显示偏好分开存储。先展示最近成功数据，超过 24 小时在打开页面或重新可见时刷新；“更多 → 数据来源”可查看覆盖年份、更新时间及手动刷新。缓存失败时退化为内存，网络失败不清空已有数据。主源完整年度数据优先，备用源仅标记部分覆盖；区间跨越未完整收录年份时，工作日计算明确改为仅按周末估算。

支持 1900—2100 年查询、假期总览与倒计时、日期区间计算、公农历互查及节气总览，不提供个人日程或云同步。仅验证日历模块可运行 `cd studio && pnpm exec vitest run src/features/tools/tools/misc/calendar/tests`。

#### 三方组件清单

Studio 的依赖声明在 `studio/package.json`；Office 转换引擎是随仓库提供的 WASM 资源，不通过包管理器安装。下面按用途列出主要三方组件：

| 分类     | 组件                                                          | 用途                                                                                           |
| -------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 框架     | `vue`                                                         | Studio 主应用框架                                                                              |
| 框架     | `vue-router`                                                  | 页面路由与导航                                                                                 |
| 框架     | `pinia`                                                       | 全局状态管理                                                                                   |
| 框架     | `react`、`react-dom`                                          | Zitie 字帖应用及部分 React 工具                                                                |
| UI       | `@tabler/icons-vue`                                           | 图标库                                                                                         |
| UI       | `ranui`                                                       | `ranui/message` 全局消息提示组件（仅 Office 运行时）                                           |
| 交互     | `vue-draggable-plus`                                          | Vue 拖拽交互                                                                                   |
| 绘图     | `@excalidraw/excalidraw`                                      | 白板和手绘风格绘图                                                                             |
| 思维导图 | `mind-elixir`                                                 | 思维导图编辑                                                                                   |
| 思维导图 | `markmap-lib`、`markmap-view`                                 | Markdown 大纲转思维导图并渲染                                                                  |
| 可视化   | `d3`                                                          | 图表和数据可视化                                                                               |
| 可视化   | `three`                                                       | 3D 场景和 3D 工具                                                                              |
| 可视化   | `jsoncrack-react`                                             | JSON 结构可视化                                                                                |
| 专业工具 | `cubing`                                                      | 魔方状态、算法和交互                                                                           |
| Markdown | `markdown-it`                                                 | Markdown 解析和渲染                                                                            |
| Markdown | `highlight.js`                                                | 代码语法高亮                                                                                   |
| Markdown | `mermaid`、`@visimer/core`、`@visimer/dom`、`@visimer/monaco` | Mermaid 图表渲染、可视化编辑与代码双向同步                                                     |
| Markdown | `monaco-editor`                                               | Markdown 和代码编辑器                                                                          |
| Markdown | `minisearch`                                                  | 本地全文搜索                                                                                   |
| Markdown | `js-yaml`                                                     | YAML 解析                                                                                      |
| 安全     | `dompurify`                                                   | HTML/SVG 内容清理，防止 XSS                                                                    |
| 工具函数 | `ranuts`                                                      | 通用工具函数（仅用 `ranuts/utils`）                                                            |
| Office   | `docx`                                                        | 生成 Word 文档                                                                                 |
| Office   | `@ranuts/shared`、`@ranuts/converter`                         | 文档类型、i18n 与 X2T 转换封装（仓库内实现，见下方说明）                                       |
| Office   | OnlyOffice x2t                                                | 浏览器内文档转换引擎（WASM）                                                                   |
| Office   | `sql.js`                                                      | 浏览器内运行 SQLite                                                                            |
| PDF/文档 | `pdfjs-dist`                                                  | PDF 解析、预览和 Worker 渲染                                                                   |
| PDF/文档 | `pdf-lib`、`jspdf`                                            | PDF 创建、修改、合并和导出                                                                     |
| 电子书   | `foliate-js`                                                  | EPUB 等电子书解析与阅读                                                                        |
| 压缩     | `@zip.js/zip.js`、`jszip`、`fflate`                           | ZIP 文件读写和压缩                                                                             |
| 图片     | `ag-psd`                                                      | PSD 文件解析与处理                                                                             |
| 图片     | `heic-to`                                                     | HEIC/HEIF 图片转换                                                                             |
| 图片     | `utif`                                                        | TIFF 图片编解码                                                                                |
| 图片     | `html2canvas`、`@zumer/snapdom`                               | DOM 截图和 Canvas 渲染                                                                         |
| 二维码   | `jsqr`                                                        | 识别二维码                                                                                     |
| 二维码   | `qrcode`                                                      | 生成二维码                                                                                     |
| 日历     | `ical.js`                                                     | ICS/iCalendar 解析                                                                             |
| 中文     | `pinyin-pro`                                                  | 汉字转拼音和多音字处理                                                                         |
| 中文     | `cnchar`、`cnchar-order`、`cnchar-trad`                       | 汉字处理、笔顺和繁简转换                                                                       |
| 中文     | `hanzi-writer-data`                                           | Zitie 汉字笔顺数据                                                                             |
| 中文     | `lunar-javascript`                                            | 农历、节气和传统日期计算                                                                       |

开发和质量检查依赖包括 `vite`、`typescript`、`vue-tsc`、`vitest`、`eslint`（含 `@eslint/js`、`typescript-eslint`、`eslint-plugin-vue`、`eslint-config-prettier`）、`prettier`、`tailwindcss`（含 `@tailwindcss/vite`）、`@vitejs/plugin-vue`、`@vitejs/plugin-react`、`unplugin-auto-import` 及对应的 `@types/*` 类型声明包。

注意 `@ranuts/shared` 与 `@ranuts/converter` 并非从 npm 安装的包，而是 `vite.config.ts` 中配置的别名，实际指向仓库内的 `src/features/office/runtime/`；OnlyOffice 的 WASM 与编辑器资源位于 `public/office-assets/`。依赖清单以 `studio/package.json` 为准，本表只按用途归类，不逐项复制版本号。

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
PYTHONPATH=src python3 -m wallpapers export-livewall
```

采集器只保存公开接口返回的元数据和 CDN 地址，不下载媒体文件。`crawl` 默认使用 `incremental` 模式；支持 `quick`、`incremental`、`full`，以及 `--device`、`--content`、`--category`、`--keyword`、`--max-pages` 等过滤参数。`publish` 从 SQLite 生成 catalog、bootstrap 和 manifest；部署前由 `./build.sh wallpapers` 或 `./build.sh studio --with-wallpapers` 将 catalog 与 bootstrap 加密为版本化 `.bin`，公开的 `wallpapers.catalog.json` 仅保留 manifest。`export-livewall` 导出供 livewall 客户端使用的明文清单目录（不加密），默认输出到 `studio/public/data/livewall/`：`catalog.json` 是**纯索引**（分类清单 + 默认分类，不含条目），条目按一级分类拆成 `category.<id>.json`。它**不在 `run.sh` 的子命令白名单里**，需在 `wallpapers/` 目录下直接调用；`./build.sh wallpapers` 与 `./build.sh studio --with-wallpapers` 也会自动生成同一份清单。

壁纸采集器的完整参数、数据库表结构和发布说明见 [`wallpapers/README.md`](./wallpapers/README.md)。

### livewall

```bash
cd livewall
./build.sh        # 编译并组装 .app
./make-dmg.sh     # 打成可分发的 DMG（build/动态壁纸-<版本>.dmg）
./test.sh         # 运行单元测试
./run.sh          # 编译并启动正式 App（会接管桌面壁纸层）
```

macOS 没有「设置视频为壁纸」的官方 API。livewall 的做法是创建一个无边框窗口，把窗口层级钉在「系统壁纸之上、桌面图标之下」这一层，在里面用 `AVPlayerLayer` 循环播放 mp4。层级值全部由 `CGWindowLevelForKey` 派生，启动时自检是否真的落在有效区间内，并检测同层竞争。

清单由 App 在运行时从线上拉取（仓库内不保存副本），断网时用上次拉取的本地副本兜底。清单是「一份索引 + 每个一级分类一份切片」，客户端启动只拉索引（901 字节）与当前分类那一份（约 0.6 MB），**切分类再拉对应那份**，选中的分类会记住并在下次启动恢复。详见 [`livewall/README.md`](./livewall/README.md)。

省电靠一套「信号 → 状态」状态机：遮挡 / 锁屏 / 息屏 / 热压力 / 空闲 / 低电量 / 电池，任一命中即暂停，全部解除才恢复；其中「画面被完全遮挡」用坐标压缩法算精确覆盖率，避免半屏窗口被误判成盖满。开关与空闲阈值可在菜单栏的「省电设置」里实时调整。

三个全局热键（`⌥⌘P` 暂停 / `⌥⌘N` 下一张 / `⌥⌘R` 重载清单）用 Carbon `RegisterEventHotKey` 实现，**不需要辅助功能授权**；开机自启用 `SMAppService`；内容过滤按一级分类（单选，记忆上次选择）。多屏策略支持「全部同片」「仅主屏」「每屏独立」三档，每屏独立时各屏会在启动时恢复上次播放的条目。

**锁屏预览**：锁屏界面由 `loginwindow` 在安全罩层级绘制，第三方窗口盖不上去，所以锁屏能看到的只有系统墙纸本身 —— 客户端把当前这张对应的静态图（清单里的 `coverUrl`）同步成系统墙纸：桌面态被覆盖窗口挡住看不见，锁屏态正好露出来。静态图拿不到就抓当前帧兜底，退出时恢复用户原来的墙纸。维护段另有「下载当前壁纸」（视频 + 静态预览图 → `~/Downloads/livewall/`）。详见 [`livewall/README.md`](./livewall/README.md) 的「锁屏预览」与「下载当前壁纸」两节。

`Sources/LiveWallCore/` 是不依赖 `NSApplication` 的纯逻辑，可脱离 GUI 单测；`Sources/LiveWallDesktop/` 是依赖 AppKit 的桌面层窗口与层级探测。

本项目只在本机构建与运行，**不接入根目录的 `build.sh`、`run.sh`、`deploy.sh`**，也不参与站点部署。

livewall 的定位、构建方式、本机实测层级基线、省电策略与路线图见 [`livewall/README.md`](./livewall/README.md)。

## 本地处理与生成内容

Studio 和 Zitie 均以浏览器本地处理为核心。用户选择的文件、图片和附件不得上传，也不得把其内容或敏感文件信息写入日志、统计信息、Cookie、URL 或远程数据库，不执行不受信任的主动内容。新增上传、远程转换、遥测、外部服务或权限前，必须先说明影响并取得授权。

依赖安装、开发或构建过程生成的目录与文件（`node_modules/`、`build/`、`blog/public/`、`studio/dist/`、`wallpapers/wallpapers.db`、`livewall/build/`、`livewall/.build/` 等）不应手工修改或提交，`.gitignore` 已逐项排除。按项目划分的完整清单见 [AGENTS.md 的安全与清理](./AGENTS.md#安全与清理)。

生产部署、Nginx 修改、域名切换、`yarn deploy` 和远程资源操作均不属于日常本地开发步骤，需要单独确认。仓库没有统一许可证，除 `blog/` 自带 `LICENSE` 外其余项目未声明授权，使用、分发或二次开发前应分别确认。具体协作与验证规则见 [AGENTS.md](./AGENTS.md)。
