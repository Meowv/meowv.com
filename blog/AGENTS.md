# blog 协作指南

适用范围：`blog/` 目录。仓库级约定见 [`../AGENTS.md`](../AGENTS.md)，项目用途、命令与目录说明见 [`README.md`](./README.md)。
本文件只记录本项目的修改边界、约定与验证要求。

## 边界

- 只改本目录内的文件。`../studio/`、`../wallpapers/`、`../livewall/` 是同一 Git 仓库中的独立项目，不在此处顺手处理。
- 线上地址固定为 `https://meowv.com`（`_config.yml` 的 `url`）。改链接、Canonical、Sitemap、分享信息或跨站导航时保持该地址，不得自行推断 `www` 跳转、证书覆盖或 Nginx 路由。
- `public/`、`db.json`、`node_modules/` 是构建产物或依赖，不手工修改、不提交（`.gitignore` 已逐项排除）。
- 示例与配置不得包含真实 API 密钥；用环境变量或明确占位符。
- `source/_posts/` 是作者的文章内容。改动前先确认是否属于本次任务范围。
- **`source/tools/`、`source/labs/`、`source/_data/tools.json` 与 `themes/hexo-theme-matery/layout/tools/` 是已停止维护的早期小工具（Labs）**，不对外放开。不要扩展、修复或重构它们，也不要把它们写进文档当作可用功能；只在明确被要求时才改动。

## 代码结构

- `source/_posts/`：文章，按主题分子目录（`database/`、`dotnet/`、`git/`、`other/`、`python/`、`summary/`、`web/`）。
- `source/_data/`：站点共享数据（`friends.json`、`answer-book.json`）。
- `source/games/`：跳过 Hexo 渲染的独立静态应用（`plonky`、`ztype`）。
- `source/about/`、`source/contact/`、`source/friends/`、`source/categories/`、`source/tags/`、`404.md`、`robots.txt`：固定页面。
- `source/images/`：文章与页面用的图片。
- `themes/hexo-theme-matery/layout/`：EJS 模板（`_partial/` 共用片段、`_widget/` 侧栏组件）。
- `themes/hexo-theme-matery/source/`：主题 CSS、JavaScript、图片与第三方资源。
- `scaffolds/`：`hexo new` 用的模板（`post.md`、`page.md`、`draft.md`）。

## 约定

- 内容改动以 `source/_posts/` 为主。文章 Front Matter 的字段沿用相邻文章，不要引入新的字段或布局。
- 主题改动前先确认是否属于本次任务范围 —— `themes/hexo-theme-matery/` 是整体引入的第三方主题，局部改动容易在后续升级时丢失。
- `source/games/` 下的应用由 `_config.yml` 的 `skip_render: ["games/**/*"]` 原样拷贝，可以有自己的 HTML / JS 结构，不受主题约束。
- 新增站点页面时，同步检查主题 `_config.yml` 的菜单配置。

## 验证

- 改文章、Front Matter、主题配置或模板：检查 YAML、JSON、EJS 语法，以及生成后的目标页面。
- 交互改动还要看桌面端、移动端、控制台与异常路径。
- 默认**不跑** `yarn build` / `yarn clean` / `yarn server`。只有用户明确要求编译、或需要部署级置信度时才跑；涉及压缩后行为时用 `yarn clean && yarn build`。
- 收尾跑 `git diff --check` 与 `git status --short`，确认只有预期文件变化。不要自动暂存、提交或部署。
