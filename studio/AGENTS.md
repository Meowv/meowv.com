# studio 协作指南

适用范围：`studio/` 目录。仓库级约定见 [`../AGENTS.md`](../AGENTS.md)，项目用途、命令与模块说明见 [`README.md`](./README.md)。
本文件只记录本项目的修改边界、约定与验证要求。

## 边界

- 只改本目录内的文件。`../blog/`、`../wallpapers/`、`../livewall/` 是同一 Git 仓库中的独立项目，不在此处顺手处理。
- 线上地址固定为 `https://studio.meowv.com`，Zitie 为 `https://studio.meowv.com/zitie/`。改链接、Canonical、分享信息或跨站导航时保持这两个地址。
- 包管理器固定 **pnpm**（`packageManager: pnpm@11.9.0`，锁文件 `pnpm-lock.yaml`）。不要混用 npm / yarn，也不要在仓库根目录统一安装依赖。
- 不手工修改 `dist/`、`public/data/wallpapers.catalog.*` 与 `public/data/livewall/` —— 都是生成内容，`.gitignore` 已逐项排除。Zitie 的笔顺数据只在构建阶段写入 `dist/zitie/hanzi-data/`，不存在需要维护的 `public/zitie/hanzi-data/` 源目录。
- 新增生产依赖、外部服务、上传能力、远程转换或遥测前，先说明必要性和影响并取得同意。

## 代码结构

- `src/features/`：按能力划分的功能模块（`markdown`、`office`、`books`、`draw`、`mermaid`、`mind`、`notes`、`tools`、`wallpapers`、`zitie`）。
- `src/pages/`、`src/layouts/`、`src/router/`：页面、应用壳与路由。
- `src/components/`、`src/composables/`：共享组件与组合式逻辑。
- `src/core/`：浏览器、本地隐私与通用基础能力（`browser/`、`mermaid/`、`privacy/`、`shared/`、`components/`）。
- `src/assets/`、`public/`：样式与静态资源。
- `vite/`：自定义 Vite 插件与构建配置（`buildConfig.ts`、`zitiePlugin.ts`、`builtinBooksDevPlugin.ts`、`cubingWorkerPreloadPlugin.ts`、`serviceWorkerPlugin.ts`、`wallpaperConfig.ts`、`wallpaperDownloadProxyPlugin.ts`）。
- `scripts/encrypt-wallpaper.mjs`：部署前把壁纸 catalog 与 bootstrap 加密为版本化 `.bin` 的唯一入口。
- `patches/`：pnpm patch 的补丁（`@excalidraw/excalidraw@0.18.1`、`jsoncrack-react@1.0.3`），升级对应依赖时要一并处理。
- `src/features/zitie/`：独立 React 字帖应用的组件、配置、Canvas、字体与导出逻辑。
- `zitie.html`：Zitie 所有页面共用的唯一 HTML 源模板。
- `public/zitie/`：Zitie 字体、Logo、图标等静态资源。

## 编码与运行约定

- 使用 Vue 3 Composition API、严格 TypeScript 和现有 `@/` 路径别名。
- 首页不得预加载重型编辑器或 WASM；其余菜单各自独立路由并按需加载。
- 文件打开、新建、保存和销毁必须经过统一的文件交接入口（`src/composables/useFileLauncher.ts` 与 `src/core/browser/file-handoff.ts`），不要在页面内自行判断格式或跳转。
- 需要串行化的渲染与保存必须排队执行，不要引入并行：Mermaid 任务统一走 `src/core/mermaid/scheduler.ts` 的 `enqueueMermaidTask`；绘图保存与书籍渲染各自维护 Promise 链。
- **缓存失效有两条不能动的约定**，改动前先读注释：
  - `public/sw.js` 的 `CACHE_VERSION` 是构建期注入的占位符（`vite/serviceWorkerPlugin.ts` 在 `closeBundle` 里替换成产物摘要），**不要写死成常量** —— 写死会让浏览器逐字节比对后认为 SW 永远没变，`activate` 的旧缓存清理就永远不执行，Cache Storage 会跨发版无限累积。
  - pdfjs 运行时资源（`jbig2.wasm`、`openjpeg.wasm`、`qcms_bg.wasm` 及 no-wasm 回退）**不能加文件名哈希** —— pdfjs 按固定文件名从 `wasmUrl` 指向的目录里取。它们的失效靠 `buildConfig.ts` 里带 pdfjs 版本的**目录名**（`assets/pdfjs-<版本>/`）。
- **用户文件、图片和附件不得上传**，也不得写入 Cookie、日志或远程数据库。涉及文件系统、导出、Worker 或对象 URL 时，保留现有的授权、取消和资源释放处理。
- 壁纸页的桌面 App 推广位（`src/features/wallpapers/app-promo/`）在运行时读取同域 `data/livewall/version.json` 获取版本与安装包地址；`livewall-meta.ts` 的 `LIVEWALL_FALLBACK_VERSION` 是拉取失败时的静态兜底，**livewall 发版后必须同步更新**（兜底下载地址由该常量派生，不手写完整 URL，以防版本与地址漂移）。

### 工具注册表

`src/features/tools/tools.ts` 的 `toolCategorySeeds` 是内置工具分类与条目的**唯一来源**。每个工具的 `id` 同时是路由末段（`/tools/<id>`）和实现目录名（`src/features/tools/tools/<分类>/<id>/index.vue`，由 `import.meta.glob` 自动映射）。

新增或删除工具时，注册表与实现目录必须保持一致 —— 判据是「注册表里的 id 集合」与「`tools/<分类>/<id>/` 的目录集合」相等。历史上出现过实现目录已存在但未进注册表的漂移（`misc/` 下曾有这种目录），这类工具在界面上完全不可达。

`public/data/tools-links.yaml` 提供外链工具与书签，**运行时加载、不参与构建**，条目数会变，不要写进任何文档。

## Zitie 约定

- 使用 React 18 函数组件和严格 TypeScript，遵循 Studio 的 Prettier 规则、PascalCase 组件和 camelCase 函数命名。
- Zitie 的 HTML 只加载 Zitie React 入口和 CSS，不加载 Vue、`StudioShell` 或 Studio CSS；**不要将 `/zitie` 注册到 Vue Router**。
- pathname、练习模式和页面元数据统一维护在 `src/features/zitie/routes.ts`。
- 开发时由 Vite 中间件从单一 HTML 模板响应各页面，构建时再生成目录式 HTML；不要为每条路由复制相同的 HTML。
- 笔顺数据在开发时直接从 `hanzi-writer-data` 响应，构建时复制到 `dist/zitie/hanzi-data/`；**不要生成或提交 `public/zitie/hanzi-data/`**。
- 涉及分页、Canvas、字体、打印或导出时，验证应覆盖多页、PNG/PDF/ZIP 导出、打印、窄屏布局和资源路径。

## 验证

- 分层执行，按改动范围从小到大：`pnpm exec vitest run <目录>`（定向单测）→ `pnpm typecheck` → `pnpm lint` → `pnpm build`。
- 本机 `pnpm` 不在 PATH，可用 `./node_modules/.bin/{vitest,vue-tsc,eslint,prettier}` 代替。
- 测试环境**没有 jsdom**，因此只能测纯逻辑：`DOMPurify.isSupported` 为 `false`，`createImageBitmap` 不存在（图片处理走文件头解析回退）。为纯函数写测试时注意辅助函数的返回类型需写成 `Uint8Array<ArrayBuffer>`。
- 界面或交互改动不能只凭静态检查判定完成；条件允许时启动 `pnpm dev` 并在浏览器里检查实际页面、关键交互、窄屏布局、控制台和异常路径。
- 除非用户明确要求，不主动执行完整 `pnpm build`（`vue-tsc` 约 7 分钟、`vitest run` 单个目录 1.5–3 分钟，全量更久）。只有完整构建才能可靠验证时，先说明原因并征得同意。
- 收尾跑 `git diff --check` 与 `git status --short`，确认只有预期文件变化。
