# Blog 协作指南

适用于 `blog/`。仓库通用规则见 [`../AGENTS.md`](../AGENTS.md)；用途、结构与命令见 [`README.md`](./README.md)。

## 修改边界

- `source/_posts/` 是作者内容；只在任务涉及文章时修改，Front Matter 沿用相邻文章的字段与布局。
- `themes/hexo-theme-matery/` 是引入的主题；只改任务所需部分。新增站点页面时检查主题 `_config.yml` 的菜单。
- `source/tools/`、`source/labs/`、`source/_data/tools.json` 和主题 `layout/tools/` 是已停止维护的 Labs，仅在明确要求时修改，不将其列为当前功能。
- `source/games/` 中的应用由 `skip_render` 原样拷贝，各自维护 HTML 与 JavaScript，不套用主题页面结构。

## 验证

- 文章、Front Matter、站点或主题配置改动：检查相关 YAML、JSON 或 EJS 语法及目标页面。
- 交互改动：检查桌面与窄屏页面、控制台和异常路径。
- 构建、清理及其他仓库级验证要求遵循 [`../AGENTS.md`](../AGENTS.md#验证与交付)。
