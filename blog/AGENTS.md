# 仓库指南

## 项目结构与模块组织

本仓库是使用 `hexo-theme-matery` 主题的 Hexo 7 静态博客。站点内容位于 `source/`：文章存放在 `source/_posts/`，独立页面使用 `source/about/` 等目录，共享数据存放在 `source/_data/`。项目已启用 `post_asset_folder`，文章图片应放入与文章同时生成的资源目录，并使用相对路径引用。

主题模板与资源位于 `themes/hexo-theme-matery/`。EJS 模板存放在 `layout/`，Stylus、CSS、JavaScript、图片及第三方库位于 `source/`。`source/games/` 中的独立应用不经过 Hexo 渲染。一个 Labs 工具通常包含 `source/tools/<slug>/index.md`、`themes/hexo-theme-matery/layout/tools/<slug>.ejs`，以及 `source/_data/tools.json` 中的注册项。

## 构建、验证与开发命令

- `yarn install`：根据锁文件安装依赖。
- `yarn server`：在 `http://localhost:4000` 启动本地开发服务并自动重新生成页面。
- `yarn build`：生成生产站点到 `public/`。
- `yarn clean && yarn build`：清理缓存后完整构建；修改 CSS 或 JavaScript 后应使用此命令，因为 `hexo-neat` 会压缩生成资源。
- `hexo new post "标题"`：创建文章及对应资源目录。
- `yarn deploy`：通过已配置的 Hexo 部署目标发布站点，仅在明确授权发布时执行。

## 代码风格与命名约定

遵循相邻 EJS、HTML、CSS、JavaScript、YAML 或 JSON 文件的现有风格，不要格式化无关代码。优先采用简洁的浏览器端实现，代码注释使用中文。工具 slug 和文件名使用小写短横线格式，例如 `number-converter`。YAML 和 JSON 使用两个空格缩进，模板保留现有缩进方式。文章标题可以使用中文，URL 会自动转换为拼音。

## 验证要求

仓库没有自动化测试、linter、类型检查或 CI。提交前运行 `yarn build`；资源文件有改动时执行完整清理构建。涉及界面时，还应通过 `yarn server` 检查桌面端和移动端效果，并确认链接、front matter、JSON 语法及浏览器控制台均无异常。

## 提交与 Pull Request 规范

近期提交通常采用 `feat:` 或 `fix:` 加简短中文说明，例如 `feat: 添加计算稿纸工具及相关页面`。每个提交只处理一项明确变更。Pull Request 应说明修改内容、列出受影响页面和验证结果、关联相关 Issue；可见界面有变化时，应附修改前后的截图。

## 安全与配置建议

禁止提交真实 API 密钥、部署凭据、`public/`、`node_modules/` 或 `db.json` 等本地 Hexo 状态文件。Hexo 引擎配置写入 `_config.yml`；主题、评论、统计和导航配置写入 `themes/hexo-theme-matery/_config.yml`。
