# studio 协作指南

适用于 `studio/`。仓库通用规则见 [`../AGENTS.md`](../AGENTS.md)；用途、结构和命令见 [`README.md`](./README.md)。

## 修改边界

- 只修改本项目相关文件。链接、Canonical 和分享信息使用 `https://studio.meowv.com`；Zitie 使用 `https://studio.meowv.com/zitie/`。
- 使用 pnpm 和本项目锁文件；不混用其他包管理器。不要手工修改 `dist/`、`public/data/wallpapers.catalog.*`、`public/data/livewall/` 或生成的 Zitie 笔顺数据。
- 用户文件、图片和附件不得上传或写入 Cookie、日志、远程数据库。新增依赖、外部服务、上传或遥测能力按仓库规则先取得同意。

## 实现约定

- 主应用使用 Vue 3 Composition API、严格 TypeScript 和现有 `@/` 别名；页面按路由加载，不在首页预载重型编辑器或 WASM。
- 文件交接沿用 `src/composables/useFileLauncher.ts` 与 `src/core/browser/file-handoff.ts`；保留文件授权、取消及对象 URL 等资源的释放处理。
- Mermaid 渲染任务经 `src/core/mermaid/scheduler.ts` 排队；绘图保存和书籍渲染沿用各自的串行机制。
- `public/sw.js` 的 `CACHE_VERSION` 是构建期注入的占位符，不要写死；pdfjs 的 WASM 资源保留固定文件名，靠 `vite/buildConfig.ts` 中含版本的目录失效。
- 内置工具的分类与条目以 `src/features/tools/tools.ts` 为准。新增或删除工具时，同步检查注册表、`src/features/tools/tools/<分类>/<id>/index.vue` 与路由；外链目录由 `public/data/tools-links.yaml` 运行时加载。
- 壁纸页的 livewall 推广位从同域 `data/livewall/version.json` 读取版本。livewall 发版时同步更新 `src/features/wallpapers/app-promo/livewall-meta.ts` 的兜底版本。
- Zitie 是独立 React 应用，路由在 `src/features/zitie/routes.ts`；只维护 `zitie.html` 一份 HTML 模板，不注册到 Vue Router，不生成或提交 `public/zitie/hanzi-data/`。升级 `patches/` 对应的依赖时同步检查补丁。

## 验证

- 根据改动执行定向 `pnpm exec vitest run <目录>`、`pnpm typecheck` 或 `pnpm lint`；界面改动还需检查实际页面、关键交互、窄屏和控制台。
- Zitie 的分页、Canvas、字体、打印或导出改动，应检查多页与相关导出格式及资源路径。完整构建按仓库规则处理。收尾执行 `git diff --check` 和 `git status --short`。
