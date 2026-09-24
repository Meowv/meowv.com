# Meowv Studio

[Meowv Studio](https://studio.meowv.com) 是浏览器内的文件与创作工作台；独立的字帖应用 [Zitie](https://studio.meowv.com/zitie/) 与它共用 Vite 工程。

本地文件、图片和附件在浏览器内处理，不上传到 Studio 后端。翻译工具会向在线服务发送用户提交的文本；壁纸、节假日、版本信息等功能会读取远程数据，外链由浏览器直接访问。

修改边界和验证要求见 [`AGENTS.md`](./AGENTS.md)；仓库脚本与产物映射见 [`../README.md`](../README.md)。

## 本地运行

需要 Node.js 和 pnpm，版本以 [`package.json`](./package.json) 为准。进入本目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:4001，Zitie 位于 /zitie/
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build          # 产物写入 dist/
```

从仓库根目录运行 `./run.sh studio` 或 `./build.sh studio`；后者将产物汇总到 `build/studio.meowv.com/`。完整命令以 [`package.json`](./package.json) 和根目录脚本为准。

## 功能与代码入口

主应用使用 Vue 3、TypeScript；各页面按路由加载。Zitie 使用 React。依赖及版本以 [`package.json`](./package.json) 和锁文件为准。

| 功能 | 用途 | 源码入口 |
| --- | --- | --- |
| 首页 | 拖放、粘贴及文件交接 | `src/pages/HomePage.vue` |
| Markdown | 本地工作区、编辑、检索与导出 | `src/features/markdown/` |
| Office | 本地文档编辑与格式转换 | `src/features/office/` |
| Books | 电子书与 PDF 阅读 | `src/features/books/` |
| Whiteboard | 画板与文件导出 | `src/features/draw/` |
| Mermaid、Mind | 图表与思维导图编辑 | `src/features/mermaid/`、`src/features/mind/` |
| Notes | 本地便签 | `src/features/notes/` |
| Wallpapers | 壁纸浏览、预览与下载 | `src/features/wallpapers/` |
| Tools | 本地工具与外链目录 | `src/features/tools/` |
| Zitie | 独立字帖应用 | `src/features/zitie/` |

主应用菜单见 `src/layouts/StudioShell.vue`，路由见 `src/router/index.ts`。内置工具分类与条目以 `src/features/tools/tools.ts` 为准；外链与书签从 `public/data/tools-links.yaml` 运行时读取。

## 数据与构建

- Zitie 共用 `zitie.html` 源模板；开发时访问 `/zitie/`，构建时生成目录式页面，并将笔顺数据复制到 `dist/zitie/hanzi-data/`。
- 壁纸目录由 [`../wallpapers/`](../wallpapers/README.md) 生成，再由 `scripts/encrypt-wallpaper.mjs` 加密。根目录的 `./build.sh wallpapers` 只生成目录；`./build.sh studio --with-wallpapers` 在构建前生成目录。`public/data/wallpapers.catalog.*` 是生成内容。
- `pnpm build` 输出 `dist/`；根目录 `./build.sh studio` 汇总到 `build/studio.meowv.com/`。发布流程见 [`../README.md`](../README.md)。
