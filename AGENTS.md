# 仓库协作指南

## 适用范围

本文件适用于仓库中的 `blog/`、`studio/` 与 `zitie/`。子项目不再维护独立的 `AGENTS.md` 或 `README.md`；项目总览和通用说明统一维护在根目录 `README.md`，协作规则统一维护在本文件。

这是同一 Git 仓库内的 3 个独立项目，不是统一的 npm/pnpm workspace。执行命令前先进入目标目录，并使用该项目已有的包管理器、锁文件、脚本和代码风格。

## 沟通与修改原则

- 默认使用简体中文沟通；代码、命令、路径、API 名称和原始报错保持原文。
- 先确认任务属于哪个子项目，只修改任务范围内的文件。
- 优先最小改动，复用相邻组件、工具函数、配置和实现模式，避免跨项目复制逻辑或无关重构。
- 不覆盖、撤销或格式化用户已有的无关改动；工作区不干净时先识别改动归属。
- 注释只在有解释价值时添加，新增或修改的注释默认使用中文。
- 未经明确要求，不提交、不推送、不创建版本、不部署，也不修改生产环境。
- 新增生产依赖、外部服务、上传能力、远程转换、遥测或权限变更前，先说明必要性和影响并征得同意。

## 项目状态与技术边界

| 目录      | 线上状态                  | 技术栈                              | 包管理器 |
| --------- | ------------------------- | ----------------------------------- | -------- |
| `blog/`   | `meowv.com` 已上线        | Hexo 7、EJS、Stylus                 | Yarn     |
| `studio/` | `studio.meowv.com` 开发中 | Vue 3、TypeScript、Vite、Vue Router | pnpm     |
| `zitie/`  | `zt.meowv.com` 已上线     | Vinext、Next.js、React、TypeScript  | npm      |

涉及站点链接、Canonical、Sitemap、分享信息或跨站导航时：

- 保持 `meowv.com`、`studio.meowv.com` 与 `zt.meowv.com` 的既定地址；Studio 上线前不得写成已上线。
- 不自行推断 `www` 跳转、证书覆盖、Nginx 路由或生产目录；部署前应检查实际环境。

## 根目录脚本

- `run.sh`：不传参数时按 `blog`、`studio`、`zitie` 并行启动三个项目；单项目参数支持 `blog`/`b`、`studio`/`s`、`zitie`/`z`。
- 固定开发端口依次为 Blog `4000`、Studio `4001`、Zitie `4002`，不得静默改用其他端口。
- `build.sh`：不传参数时依次编译三个项目；单项目参数同样支持全称与简写。
- 汇总产物固定为 `build/meowv.com/`、`build/studio.meowv.com/` 与 `build/zt.meowv.com/`。
- Zitie 只将 `zitie/dist/client/` 复制到汇总目录，不复制 `zitie/dist/server/`。
- `build/` 是可替换的生成目录，不提交到 Git。修改脚本时继续保持全量构建完成后再替换旧目录，避免失败时留下半套发布产物。

## Blog 约定

### 结构

- `source/_posts/`：文章。
- `source/_data/`：站点共享数据。
- `source/tools/<slug>/index.md`：Labs 工具入口页。
- `themes/hexo-theme-matery/layout/`：EJS 模板。
- `themes/hexo-theme-matery/source/`：主题 CSS、JavaScript、图片和第三方资源。
- `source/games/`：跳过 Hexo 渲染的独立静态应用。

常规 Labs 工具应沿用现有三处集成方式：工具入口 Markdown、同名 EJS 模板，以及 `source/_data/tools.json` 注册项。工具 slug 和文件名使用小写短横线。

### 命令与生成内容

- 开发：`yarn server`
- 构建：`yarn clean && yarn build`
- 生成内容：`public/`、`db.json`

修改文章、Front Matter、主题配置或模板时，检查 YAML/JSON/EJS 语法和生成后的目标页面。修改交互工具时，还应在浏览器检查桌面端、移动端、控制台和异常路径。

## Studio 约定

### 结构

- `src/features/`：按能力划分的功能模块。
- `src/pages/`、`src/layouts/`、`src/router/`：页面、应用壳与路由。
- `src/components/`、`src/composables/`：共享组件与组合式逻辑。
- `src/core/`：浏览器、本地隐私和通用基础能力。
- `src/assets/`、`public/`：样式与静态资源。

使用 Vue 3 Composition API、严格 TypeScript 和现有 `@/` 路径别名。必须保持浏览器本地处理边界：用户文件、图片和附件不得上传，也不得写入 Cookie、日志或远程数据库。涉及文件系统、导出、Worker 或对象 URL 时，保留现有的授权、取消和资源释放处理。

### 命令与构建产物

- 开发：`pnpm dev`
- 类型检查：`pnpm typecheck`
- Lint：`pnpm lint`
- 构建：`pnpm build`

构建产物为 `dist/`，不要提交。首页不得预加载重型编辑器或 WASM；文件打开、新建、保存和销毁必须经过统一会话与串行编辑器队列。

## Zitie 约定

### 结构

- `app/*/page.tsx`：各练习模式路由。
- `app/components/`：共享界面和字帖编辑器。
- `app/lib/`：分页、Canvas 绘制、字体、导出和类型。
- `app/config/`：页面内容与配置。
- `public/fonts/`、`public/brand/`：字体和品牌静态资源。
- `scripts/sync-hanzi-data.mjs`：笔顺数据同步。

使用 React 函数组件和严格 TypeScript。延续现有两空格缩进、分号、双引号 import、PascalCase 组件和 camelCase 函数命名。可复用行为放入 `app/lib/` 或 `app/components/`，不要在路由之间复制。

保持 `next.config.ts` 中静态导出相关配置。`public/hanzi-data/` 由脚本生成，不手工修改，也不提交。

### 命令与验证重点

- 开发：`npm run dev`
- 类型检查：`npx tsc --noEmit`
- 构建：`npm run build`
- 预览：`npm run start`

涉及分页、Canvas、字体、打印或导出时，浏览器验证应覆盖多页、PNG/PDF/ZIP 导出和打印结果；同时检查窄屏布局与资源路径。

## 验证规则

- 修改后优先执行与改动直接相关的轻量检查，例如语法、格式、类型检查、定向测试或 `git diff --check`。
- 除非用户明确要求，不主动执行完整编译、完整构建、全量测试或端到端测试。
- 如果只有完整构建才能可靠验证，先说明原因并征得同意。
- 界面或交互改动不能仅凭静态检查判定完成；条件允许时启动目标项目并检查实际页面。
- 最终只报告实际执行过的验证，并明确尚未执行的构建、浏览器检查或生产验证。

## 安全、生成文件与清理

- 不输出或提交真实 API 密钥、令牌、密码、证书、个人文件内容或其他敏感信息；使用环境变量或明显占位符。
- 不提交 `node_modules/`、构建目录、测试报告、覆盖率目录、`*.tsbuildinfo`、`.DS_Store` 或项目 `.gitignore` 已排除的内容。
- 清理代码或文件前，先区分源码、配置、依赖、缓存、构建产物和用户本地数据，列出拟删除目标及依据；不确定用途的文件先查引用和 Git 历史。
- 批量删除、覆盖重要文件、强制推送、改写历史、生产部署、远程资源删除等操作，必须在执行前再次确认具体范围、影响和可恢复方式。

## 交付要求

完成任务后简要说明：

- 修改内容及涉及文件。
- 实际执行的检查或测试。
- 未验证事项、兼容性风险或部署前待确认项。

除非用户明确要求，不创建子项目级 `AGENTS.md` 或 `README.md`；需要补充说明时更新根目录文档，或使用项目现有的 `docs/`、源码注释和配置文件。
