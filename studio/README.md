# Meowv Studio

浏览器本地工作台，线上地址 [studio.meowv.com](https://studio.meowv.com)，字帖应用 Zitie 挂在 [/zitie/](https://studio.meowv.com/zitie/)。

**核心承诺：文件不上传。** 用户选择的文件、图片和附件都在设备内处理，不写入 Cookie、日志、URL 或远程数据库。文档类能力（Markdown、Office、Books、Mermaid、Mind、Notes、图片与 PDF 工具）全部在浏览器里跑。

站点本身是静态前端，不提供业务后端。除加载本站静态资源外，以下功能会按用户操作或页面状态发起网络请求：

- 壁纸页读取加密目录、封面和视频 CDN；桌面端推广位读取同域 `data/livewall/version.json`。
- 日历工具读取节假日数据源（见[日历工具](#日历工具)）。
- 翻译工具调用在线翻译服务；404 页面会尝试读取一句一言文案。
- Books 的内置书架和 Markdown 导出可能读取配置中指定的远程资源；工具聚合页会加载 `public/data/tools-links.yaml`，外链图标或站点由浏览器直接访问。

除翻译工具主动提交的用户输入文本外，这些请求不会上传本地文件、登录凭据或 Studio 业务数据。翻译文本会发送到上面列出的在线服务；浏览器扩展、外链站点和用户主动粘贴的远程地址不在 Studio 的控制范围内。

- 用途、模块与命令 → 本文件
- 修改边界、编码约定与验证要求 → [`AGENTS.md`](./AGENTS.md)
- 仓库级概览与根目录脚本 → [`../README.md`](../README.md)、[`../AGENTS.md`](../AGENTS.md)

## 技术栈

| 层       | 选择                                                           |
| -------- | -------------------------------------------------------------- |
| 主应用   | Vue 3（Composition API）+ 严格 TypeScript + Vue Router + Pinia |
| 字帖应用 | React 18（同一个 Vite 工程的多入口，见 [Zitie](#zitie)）       |
| 构建     | Vite 8，多入口（Vue 应用 + Zitie）                             |
| 样式     | Tailwind CSS 4 + 组件内样式                                    |
| 质量     | `vue-tsc`、ESLint（flat config）、Prettier、Vitest             |
| 运行环境 | Node.js `>= 22.12.0`，包管理器 pnpm `11.9.0`                   |

## 快速开始

```bash
cd studio
pnpm install --frozen-lockfile

pnpm dev          # 开发服务器，http://localhost:4001
pnpm typecheck    # vue-tsc --noEmit
pnpm lint         # eslint . && prettier --check .
pnpm lint:fix     # eslint . --fix && prettier --write .
pnpm test:unit    # vitest run
pnpm build        # typecheck + vite build
pnpm preview      # 预览 dist/
```

从仓库根目录也可以：`./run.sh studio`（等价 `./run.sh s`，含 `/zitie/`）启动开发服务器，`./build.sh studio` 构建并汇总到 `build/studio.meowv.com/`。

Zitie 不需要单独启动，开发时直接访问 `http://localhost:4001/zitie/`。

## 目录结构

```text
studio/
├─ index.html                 Vue 应用入口
├─ zitie.html                 Zitie 所有页面共用的唯一 HTML 模板
├─ vite.config.ts             多入口与别名配置
├─ vite/                      自定义 Vite 插件与构建配置
├─ scripts/encrypt-wallpaper.mjs   壁纸 catalog 与 bootstrap 的加密入口
├─ patches/                   pnpm patch 补丁
├─ public/
│  ├─ data/                   运行时数据：tools-links.yaml、壁纸 catalog 与 .bin、livewall/ 清单
│  ├─ office-assets/          OnlyOffice 编辑器与 WASM 资源
│  ├─ zitie/                  Zitie 字体、Logo、图标
│  ├─ excalidraw-assets/ brand/ fonts/ icons/ sounds/
│  ├─ sw.js manifest.webmanifest
├─ src/
│  ├─ main.ts App.vue
│  ├─ pages/                  HomePage.vue、NotFoundPage.vue
│  ├─ layouts/StudioShell.vue 应用壳与左侧导航
│  ├─ router/index.ts         路由表
│  ├─ components/             共享组件（含 StudioFooter、StudioDonationDialog、ThemeToggle…）
│  ├─ composables/            useFileLauncher、usePageMeta、useResourceScope、useTheme
│  ├─ core/                   browser/ mermaid/ privacy/ shared/ components/
│  ├─ features/               按能力划分的功能模块（见下）
│  └─ assets/
└─ dist/                      构建产物（.gitignore）
```

`src/features/` 下的模块：`markdown`、`office`、`books`、`draw`、`mermaid`、`mind`、`notes`、`tools`、`wallpapers`、`zitie`。

## 功能菜单

左侧导航在 `src/layouts/StudioShell.vue` 的 `primaryRoutes` 中集中声明；路由与页面元数据位于 `src/router/index.ts`，两处是菜单和路由变更时的检查入口。首页 `/` 是统一文件入口，支持拖放文件和粘贴图片，再按格式交接给对应模块；其余菜单各自独立路由并按需加载，首页不预载重型编辑器或 WASM。菜单数量和条目名称不在文档中固定，避免与源码漂移。

| 菜单       | 路由                                              | 页面                              |
| ---------- | ------------------------------------------------- | --------------------------------- |
| Markdown   | `/markdown`                                       | `MarkdownStudioPage.vue`          |
| Office     | `/office`、`/office/:format(doc\|xls\|ppt\|csv)?` | `OfficeStudioPage.vue`            |
| Books      | `/books`                                          | `BooksPage.vue`                   |
| Whiteboard | `/draw`                                           | `DrawPage.vue`                    |
| Mermaid    | `/mermaid`                                        | `MermaidPage.vue`                 |
| Mind       | `/mind`                                           | `MindPage.vue`                    |
| Notes      | `/notes`                                          | `NotesPage.vue`                   |
| Wallpapers | `/wallpapers`                                     | `WallpapersPage.vue`              |
| Tools      | `/tools`、`/tools/:toolId`                        | `ToolsHome.vue`、`ToolDetail.vue` |

### Markdown

- 功能定位：浏览器本地 Markdown 工作台，把本机文件夹当作工作空间，写作、预览、检索与导出都在设备内完成。
- 主要用途：打开目录并扫描文件树，编辑并实时预览 Markdown，解析 Front Matter、Wiki 链接与相对路径图片，做本地全文搜索，导出 Markdown、HTML、PDF、PNG 和 Word。
- 子模块与入口：工作区 `MarkdownWorkspace.vue` 位于 `src/features/markdown/`；界面组件按职责分在 `components/` 下的编辑器、文件树、预览、侧栏、布局与反馈目录；能力封装在 `services/`，覆盖目录读写与权限、Markdown 解析、检索、链接与知识库、图片与媒体、导出和本地存储；全文索引在 `workers/search.worker.ts` 中构建，工作区状态在 `stores/workspace.ts`。

### Office

- 功能定位：浏览器本地 Office 编辑器，基于 OnlyOffice 运行时，新建、打开、编辑和保存都在本机完成。
- 主要用途：新建四类文档 —— 文字文档（DOCX）、电子表格（XLSX）、演示文稿（PPTX）和数据表格（CSV），打开本地文件、查看最近文档，并在浏览器内完成格式转换。
- 子模块与入口：运行时入口 `runtime/office-controller.ts`；`runtime/lib/` 管理活动文档、编辑器会话、文件类型与最近文档，`runtime/converter/` 封装 X2T 转换与 docx 打包，`runtime/shared/` 提供文档类型、国际化与状态；编辑器与 WASM 资源位于 `public/office-assets/`。

### Books

- 功能定位：把本地文档渲染成可翻页的仿真书，用 3D 翻页动画阅读。
- 主要用途：打开 PDF、EPUB、TXT、MOBI、AZW3、FB2 和 CBZ，支持跨页排版、书架管理、阅读进度与分页索引，也可以直接从内置书架取书。
- 子模块与入口：格式分发在 `publication/PublicationLoader.ts`，PDF、CBZ、TXT 各走 `publication/` 下的同名子目录，其余格式经 `publication/foliate/`；渲染引擎在 `engine/`，含 `BookEngine`、`BookStateMachine`、`BookConfig`、跨页计算 `spreads.ts`、三维辅助 `three-utils.ts`、书本模型 `engine/book/` 和翻页动画 `engine/turn/`；持久化在 `persistence/`，覆盖书架、分页索引、阅读进度、指纹与封面缩略图；页面缓存为 `cache/` 下的 `PageCache` 与 `PageSurfaceCache`；内置书架 `builtin/BuiltinShelf.ts` 读取 `public/data/books/`，开发与预览由 `vite/builtinBooksDevPlugin.ts` 提供目录索引和分段请求，目录不存在时书架为空。

### Whiteboard

- 功能定位：基于 Excalidraw 的浏览器本地白板，用于画草图、流程图和架构图。
- 主要用途：管理多个画板并自动保存，导出 PNG、SVG 和 Excalidraw 文件；绑定本地文件句柄后可以把改动写回磁盘。
- 子模块与入口：编辑器装配与交互在 `editor.ts`，样式在 `editor.css`；持久化在 `storage.ts`，使用 IndexedDB `meowv-studio-draw` 的 `documents`、`settings`、`library` 三个存储区，并封装文件系统写入权限校验。

### Mermaid

- 功能定位：Mermaid 图表编辑器，代码编辑与可视化画布双向同步。
- 主要用途：编写并实时预览图表，套用示例，导出 PNG、JPEG、WebP、SVG、PDF、MMD 源码、Markdown 和图表文档，也可以生成分享链接。
- 子模块与入口：可视化层在 `visual/`，含会话 `MermaidEditingSession`、渲染与视口适配器，以及界面外壳和能力探测；服务在 `services/`，覆盖配置、导出、分享编解码与本地草稿；示例数据在 `examples.ts`。渲染任务统一经 `src/core/mermaid/scheduler.ts` 的 `enqueueMermaidTask` 串行执行。

### Mind

- 功能定位：本地思维导图编辑器，同时支持可视化节点编辑和 Markdown 大纲两种文档形态。
- 主要用途：创建和整理导图，切换主题、方向与背景，导出 Markdown、PNG、SVG 和 JSON；Markdown 大纲与可视化结构可以相互转换。
- 子模块与入口：渲染适配器在 `adapters/`，分别对接 mind-elixir 与 markmap；结构转换在 `conversion.ts`，类型与默认设置在 `types.ts`；持久化在 `storage.ts`，使用 IndexedDB `meowv-studio-mind`。

### Notes

- 功能定位：桌面便签式的速记面板，便签自由摆放、随写随存。
- 主要用途：新建彩色便签并调整位置、尺寸、层级、颜色与透明度，置顶或折叠，在编辑与预览之间切换；粘贴图片时会压缩后内嵌到便签内容中。
- 子模块与入口：组件在 `components/`，含页头、卡片、编辑器与预览；Markdown 渲染在 `services/markdown.ts`，图片压缩与文字样式在 `lib/`；持久化在 `storage.ts`，使用 IndexedDB `meowv-studio-notes`。

### Wallpapers

- 功能定位：壁纸浏览与下载页，数据来自 [Wallpapers Crawler](../wallpapers/README.md) 生成并加密的目录，页面不请求业务后端。
- 主要用途：按桌面/手机与静态/动态筛选，按分类和关键词查找，分页浏览、动态预览并下载。
- 子模块与入口：数据逻辑在 `composables/useWallpapers.ts` 与 `services/wallpaperRepository.ts`；`workers/wallpapers.worker.ts` 在 Worker 中读取 `public/data/wallpapers.catalog.json`、解密对应的 `.bin` 并写入 IndexedDB `meowv-wallpapers-catalog`；数据结构在 `types.ts`。目录的生成与加密见 [Wallpapers Crawler](../wallpapers/README.md)。
- 桌面 App 推广：右下角浮层用于推广 livewall 桌面端，只在「电脑」且 Mac 平台下出现；关闭只在当前标签页会话内有效（记 `sessionStorage`，刷新或新开标签页会重新露出）。Mac 版发布信息运行时读取同域 `data/livewall/version.json`，静态兜底常量在 `app-promo/livewall-meta.ts`。实现在 `src/features/wallpapers/app-promo/`。

### Tools

- 功能定位：工具聚合页，把内置工具与外部链接按分类收在一处。
- 主要用途：按分类浏览、按关键词搜索、收藏常用工具；内置工具在本站本地运行，外链工具在新标签打开。
- 子模块与入口：页面为 `src/features/tools/pages/ToolsHome.vue` 与详情页 `ToolDetail.vue`；`src/features/tools/tools.ts` 的 `toolCategorySeeds` 声明分类与内置工具；每个工具实现为 `src/features/tools/tools/<分类>/<id>/index.vue`，由 `import.meta.glob` 自动映射；外部链接与书签在运行时从 `public/data/tools-links.yaml` 加载；`components/` 提供卡片、搜索、侧边栏与背景组件，`composables/` 提供目录、收藏与偏好。首页依次呈现收藏、分类工具、书签与 AI 站点区域，其中后两者只在配置了对应数据时显示。

内置工具的 `id` 同时是路由末段和实现目录名。图片工具与 PDF 工具是薄封装，能力集中在共享层 `_shared/image/ImageTool.vue`（按 `mode`）与 `_shared/pdf/PdfTool.vue`（按 `slug`），其余工具各自实现。

**分类与条目以 `tools.ts` 的 `toolCategorySeeds` 为准**，本文件不逐条复制（会漂移）。需要新增、删除或改名时，以注册表和实现目录的检查结果为准。

外链工具与书签的条目数会变，不在此处列数；数据在 `public/data/tools-links.yaml`，修改后刷新页面即可生效，不需要重新构建。

### 日历工具

`/tools/calendar` 使用本地算法计算农历、常见节日和二十四节气；休班安排由浏览器直接读取 `lanceliao/china-holiday-calender` 的 `holidayAPI.json`，备用为 `muhac/chinese-holidays-calendar` 的放假与补班 ICS。请求不携带凭据或 Referrer，不需要后端代理。上游新增年份后，刷新即可获取，不需要重新构建或手动更新 ICS。

公共数据缓存与显示偏好分开存储。先展示最近成功数据，超过 24 小时在打开页面或重新可见时刷新；“更多 → 数据来源”可查看覆盖年份、更新时间及手动刷新。缓存失败时退化为内存，网络失败不清空已有数据。主源完整年度数据优先，备用源仅标记部分覆盖；区间跨越未完整收录年份时，工作日计算明确改为仅按周末估算。

支持 1900—2100 年查询、假期总览与倒计时、日期区间计算、公农历互查及节气总览，不提供个人日程或云同步。仅验证日历模块可运行：

```bash
cd studio && pnpm exec vitest run src/features/tools/tools/misc/calendar/tests
```

## 三方组件清单

依赖声明在 `studio/package.json`；Office 转换引擎是随仓库提供的 WASM 资源，不通过包管理器安装。下面按用途列出主要三方组件：

| 分类     | 组件                                                          | 用途                                                     |
| -------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| 框架     | `vue`、`vue-router`、`pinia`                                  | 主应用框架、路由与状态管理                               |
| 框架     | `react`、`react-dom`                                          | Zitie 字帖应用及部分 React 工具                          |
| UI       | `@tabler/icons-vue`、`ranui`                                  | 图标库；`ranui/message` 全局消息提示（仅 Office 运行时） |
| 交互     | `vue-draggable-plus`                                          | Vue 拖拽交互                                             |
| 绘图     | `@excalidraw/excalidraw`                                      | 白板和手绘风格绘图                                       |
| 思维导图 | `mind-elixir`、`markmap-lib`、`markmap-view`                  | 思维导图编辑；Markdown 大纲转思维导图并渲染              |
| 可视化   | `d3`、`three`、`jsoncrack-react`                              | 图表、3D 场景与 JSON 结构可视化                          |
| 专业工具 | `cubing`                                                      | 魔方状态、算法和交互                                     |
| Markdown | `markdown-it`、`highlight.js`、`monaco-editor`、`minisearch`  | 解析渲染、语法高亮、编辑器与本地全文搜索                 |
| Markdown | `mermaid`、`@visimer/core`、`@visimer/dom`、`@visimer/monaco` | Mermaid 渲染、可视化编辑与代码双向同步                   |
| Markdown | `js-yaml`                                                     | YAML 解析                                                |
| 安全     | `dompurify`                                                   | HTML/SVG 内容清理，防止 XSS                              |
| 工具函数 | `ranuts`                                                      | 通用工具函数（仅用 `ranuts/utils`）                      |
| Office   | `docx`、`sql.js`                                              | 生成 Word 文档；浏览器内运行 SQLite                      |
| Office   | `@ranuts/shared`、`@ranuts/converter`                         | 文档类型、i18n 与 X2T 转换封装（仓库内实现，见下）       |
| Office   | OnlyOffice x2t                                                | 浏览器内文档转换引擎（WASM）                             |
| PDF/文档 | `pdfjs-dist`、`pdf-lib`、`jspdf`                              | PDF 解析与 Worker 渲染；PDF 创建、修改、合并和导出       |
| 电子书   | `foliate-js`                                                  | EPUB 等电子书解析与阅读                                  |
| 压缩     | `@zip.js/zip.js`、`jszip`、`fflate`                           | ZIP 文件读写和压缩                                       |
| 图片     | `ag-psd`、`heic-to`、`utif`                                   | PSD 解析、HEIC/HEIF 转换、TIFF 编解码                    |
| 图片     | `html2canvas`、`@zumer/snapdom`                               | DOM 截图和 Canvas 渲染                                   |
| 二维码   | `qrcode`、`jsqr`                                              | 生成与识别二维码                                         |
| 日历     | `ical.js`、`lunar-javascript`                                 | ICS/iCalendar 解析；农历、节气和传统日期计算             |
| 中文     | `pinyin-pro`                                                  | 汉字转拼音和多音字处理                                   |
| 中文     | `cnchar`、`cnchar-order`、`cnchar-trad`                       | 汉字处理、笔顺和繁简转换                                 |
| 中文     | `hanzi-writer-data`                                           | Zitie 汉字笔顺数据                                       |

开发和质量检查依赖包括 `vite`、`typescript`、`vue-tsc`、`vitest`、`eslint`（含 `@eslint/js`、`typescript-eslint`、`eslint-plugin-vue`、`eslint-config-prettier`）、`prettier`、`tailwindcss`（含 `@tailwindcss/vite`）、`@vitejs/plugin-vue`、`@vitejs/plugin-react`、`unplugin-auto-import` 及对应的 `@types/*` 类型声明包。

注意 `@ranuts/shared` 与 `@ranuts/converter` 并非从 npm 安装的包，而是 `vite.config.ts` 中配置的别名，实际指向仓库内的 `src/features/office/runtime/`。依赖清单以 `package.json` 为准，本表只按用途归类，不逐项复制版本号。

`patches/` 下有两个 pnpm patch 补丁（`@excalidraw/excalidraw`、`jsoncrack-react`），升级对应依赖时需要同步处理。

## Zitie

Zitie 是 Studio Vite 中独立的 React 多页面应用。源码位于 `src/features/zitie/`，唯一 HTML 模板为 `zitie.html`，字体和品牌资源位于 `public/zitie/`。它与 Studio Vue 应用使用不同 HTML 入口，不加载 `StudioShell` 或 Studio CSS。

开发时直接启动 Studio 并访问 `http://localhost:4001/zitie/`。Vite 根据 pathname 从同一模板动态渲染各页面；生产构建再自动生成目录式 HTML。笔顺 JSON 由 Vite 从 `hanzi-writer-data` 依赖按请求返回，不需要预先同步；生产构建会自动复制到 `dist/zitie/hanzi-data/` 并校验页面和关键资源。

约定见 [`AGENTS.md`](./AGENTS.md) 的「Zitie 约定」。

## 壁纸数据

壁纸页读取的是 [`../wallpapers/`](../wallpapers/README.md) 采集后生成、并由 `scripts/encrypt-wallpaper.mjs` 加密的目录：

```bash
./build.sh wallpapers                  # 只生成并加密目录，不构建项目
./build.sh studio --with-wallpapers    # 在 Studio 构建前生成目录
```

`public/data/` 下的 `wallpapers.catalog.json` 只保留 manifest，实际数据在版本化 `.bin` 文件里；这些都是生成内容，不提交 Git。

## 构建与部署

`pnpm build` 输出 `dist/`，其中包含 Zitie 的目录式 HTML 与笔顺数据。仓库根目录的 `./build.sh studio` 会把它汇总到 `build/studio.meowv.com/`，再由 `deploy.sh` 上传，详见 [`../README.md`](../README.md)。
