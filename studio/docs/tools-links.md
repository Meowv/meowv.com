# Tools 链接配置

Studio 的内置工具继续由 `src/features/tools/config/tools.ts` 管理；外部链接从站点根目录的 `/tools-links.json` 动态加载。生产环境可以单独替换这个 JSON 文件，无需重新编译 Studio 前端。

## 配置格式

```json
{
  "version": 1,
  "links": [
    {
      "id": "vue-docs",
      "category": "developer",
      "name": "Vue 文档",
      "description": "查看 Vue 官方开发文档。",
      "icon": "link",
      "url": "https://vuejs.org/"
    },
    {
      "id": "example-site",
      "category": "misc",
      "name": "示例网站",
      "description": "使用站外图片作为工具图标。",
      "icon": {
        "url": "https://example.com/icon.svg"
      },
      "url": "https://example.com/"
    }
  ]
}
```

`icon` 可以是 `ToolIcon` 支持的内置名称，也可以是包含 `url` 的对象。图标 URL 加载失败时会回退为默认工具图标。

所有链接统一在新标签页打开，并使用 `noopener noreferrer`。远程配置只会追加到已有分类，不会覆盖内置工具；同名 ID、未知分类、空名称或描述、非法 URL 会被忽略。

当前可用分类为：`developer`、`converter`、`text`、`language`、`date`、`image`、`pdf`、`design`、`generator`、`misc`、`games`。

## 加载与缓存

Tools 页面会先展示内置工具，再读取 `/tools-links.json`。校验成功的配置会缓存在浏览器本地；请求失败时继续使用最近一次有效缓存，没有缓存时只展示内置工具。

仓库中的 `public/tools-links.json` 是默认空配置。若需要不重新发版即可更新链接，应在生产环境中把 `/tools-links.json` 作为可独立替换的静态文件管理，并配置合适的缓存刷新策略。
