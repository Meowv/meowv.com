---
name: build-meowv-tool
description: 为博客新增、调整或验证 `/tools/*` 浏览器端小工具，遵循 Labs 注册、页面 frontmatter、Matery EJS 布局、内联 CSS/JS、中文交互与无构建验证约定。用于用户要求开发新小工具、扩展或修复现有工具、注册 Labs 卡片、统一工具体验或检查小工具实现时。
---

# 小工具开发

## 开始前

1. 读取仓库 `AGENTS.md`、`source/_data/tools.json`、`themes/hexo-theme-matery/layout/labs.ejs`。
2. 按需求类型选择并读取 1 至 2 个相似工具布局，不要凭空重建视觉规范。
3. 创建新工具或大幅调整页面前，读取 [references/tool-patterns.md](references/tool-patterns.md)。
4. 运行 `git status --short`，保留用户已有改动，只触碰当前工具所需文件。

## 确定产品口径

- 先从仓库发现目录、依赖和交互事实，只向用户确认无法发现且会改变结果的产品选择。
- 明确输入、输出、转换方向、精度或范围、错误状态、是否持久化、是否调用外部接口。
- 默认使用纯浏览器实现，不新增依赖、后端、密钥或本地存储；只有需求明确需要时再扩展。
- 将边界与代表性示例先写成验收用例，再实现核心算法。

## 接入工具

为普通 Labs 工具同步完成以下三处改动：

1. 在 `source/_data/tools.json` 添加唯一条目，至少包含 `slug`、`name`、`description`、`emoji`、`url`。
2. 创建 `source/tools/<slug>/index.md`，设置当前日期、`layout: "tools/<slug>"` 与 `toolSlug: <slug>`。
3. 创建或修改 `themes/hexo-theme-matery/layout/tools/<slug>.ejs`。

使用小写 kebab-case slug，并保持页面目录、布局文件、`toolSlug`、注册 URL 完全一致。将注册条目放在语义相近的工具附近。

## 实现页面

- 从 `site.data.tools` 按 `page.toolSlug` 读取标题与描述，复用背景封面和 Valine 区块。
- 工具标题与描述统一使用 `_partial/tool-header`，不要在单个工具中自定义结构或样式。
- 沿用现有卡片布局、绿色强调色和响应式断点；CSS 类添加工具专属前缀，避免污染主题全局样式。
- 优先使用页面已有的 jQuery、Materialize 和 Font Awesome，不重复引入库。
- 根据场景提供实时更新、清空、复制、示例或状态提示；实时校验使用行内错误，不连续弹 Toast。
- 文本或数字工具按需规范化全角数字、标点和运算符；精确数字使用字符串算法，禁止用 `eval` 处理用户输入。
- 仅在用户要求草稿恢复时使用 `localStorage`，键名采用 `meowv:<slug>:<purpose>`，清空内容时同步清除存储。
- 保持代码简洁；确需注释时只写中文；任何示例或配置都不得包含真实 API 密钥。

## 验证

默认不运行 `yarn build`、`yarn clean` 或 `yarn server`。完成后依次执行：

1. `node .agents/skills/build-meowv-tool/scripts/validate-tool.mjs <slug>`。
2. 为解析、转换或计算逻辑建立临时 Node 用例，覆盖正常值、空值、非法值、全角输入和范围边界；不要把临时测试文件留在仓库。
3. 重新打开改动后的长 EJS 文件，检查补丁是否混入占位符、残缺标签或无关文本。
4. 运行 `git diff --check` 与 `git status --short`，确认只有预期文件变化。

只有用户明确要求编译或需要部署级置信度时，才按 `AGENTS.md` 运行对应构建命令；涉及压缩后行为时使用 `yarn clean && yarn build`。

## 交付

用中文简要说明入口 URL、三个接入文件、核心行为和验证结果，并明确是否运行过构建。不要自动暂存、提交或部署。
