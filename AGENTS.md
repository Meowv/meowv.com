# 仓库协作指南

## 适用范围

本文件适用于仓库中的 `blog/`、`image/`、`markdown/`、`excel/`、`zitie/` 和 `pdf/`。子项目不再维护独立的
`AGENTS.md` 或 `README.md`；项目总览和通用说明统一维护在根目录 `README.md`，协作
规则统一维护在本文件。

这是同一 Git 仓库内的 6 个独立项目，不是统一的 npm/pnpm workspace。执行命令前先进入
目标目录，并使用该项目已有的包管理器、锁文件、脚本和代码风格。

## 沟通与修改原则

- 默认使用简体中文沟通；代码、命令、路径、API 名称和原始报错保持原文。
- 先确认任务属于哪个子项目，只修改任务范围内的文件。
- 优先最小改动，复用相邻组件、工具函数、配置和实现模式，避免跨项目复制逻辑或无关重构。
- 不覆盖、撤销或格式化用户已有的无关改动；工作区不干净时先识别改动归属。
- 注释只在有解释价值时添加，新增或修改的注释默认使用中文。
- 未经明确要求，不提交、不推送、不创建版本、不部署，也不修改生产环境。
- 新增生产依赖、外部服务、上传能力、远程转换、遥测或权限变更前，先说明必要性和影响并
  征得同意。

## 项目状态与技术边界

| 目录     | 线上状态                 | 技术栈                             | 包管理器 |
| -------- | ------------------------ | ---------------------------------- | -------- |
| `blog/`  | `meowv.com` 已上线       | Hexo 7、EJS、Stylus                | Yarn     |
| `image/` | `img.meowv.com` 已上线 | Vue 3、TypeScript、Vite | npm |
| `markdown/` | `md.meowv.com` 已上线    | Vue 3、TypeScript、Vite            | npm      |
| `excel/` | `excel.meowv.com` 已上线 | Vue 3、TypeScript、Vite            | pnpm     |
| `pdf/`   | `pdf.meowv.com` 已上线    | Nuxt 4、Vue 3、TypeScript          | pnpm     |
| `zitie/` | `zt.meowv.com` 已上线    | Vinext、Next.js、React、TypeScript | npm      |

涉及站点链接、Canonical、Sitemap、分享信息或跨站导航时：

- 保持 `meowv.com`、`md.meowv.com`、`excel.meowv.com`、`pdf.meowv.com` 和 `zt.meowv.com` 的现有线上地址。
- 不自行推断 `www` 跳转、证书覆盖、Nginx 路由或生产目录；部署前应检查实际环境。

## 根目录脚本

- `run.sh`：不传参数时按 `blog`、`img`、`md`、`excel`、`pdf`、`zt` 并行启动六个项目；传入其中一个参数时
  只启动对应项目。
- 固定开发端口依次为 Blog `4000`、Image `4001`、Markdown `4002`、Excel `4003`、PDF `4004`、Zitie `4005`，不得静默
  改用其他端口。
- `build.sh`：不传参数时依次编译六个项目；传入项目名时只编译并发布对应项目。
- 汇总产物固定为 `build/meowv.com/`、`build/excel.meowv.com/`、
  `build/pdf.meowv.com/`、`build/zt.meowv.com/` 和 `build/md.meowv.com/`。
- Zitie 只将 `zitie/dist/client/` 复制到汇总目录，不复制 `zitie/dist/server/`。
- `build/` 是可替换的生成目录，不提交到 Git。修改脚本时继续保持全量构建完成后再替换
  旧目录，避免失败时留下半套发布产物。

## Blog 约定

### 结构

- `source/_posts/`：文章。
- `source/_data/`：站点共享数据。
- `source/tools/<slug>/index.md`：Labs 工具入口页。
- `themes/hexo-theme-matery/layout/`：EJS 模板。
- `themes/hexo-theme-matery/source/`：主题 CSS、JavaScript、图片和第三方资源。
- `source/games/`：跳过 Hexo 渲染的独立静态应用。

常规 Labs 工具应沿用现有三处集成方式：工具入口 Markdown、同名 EJS 模板，以及
`source/_data/tools.json` 注册项。工具 slug 和文件名使用小写短横线。

### 命令与生成内容

- 开发：`yarn server`
- 构建：`yarn clean && yarn build`
- 生成内容：`public/`、`db.json`

修改文章、Front Matter、主题配置或模板时，检查 YAML/JSON/EJS 语法和生成后的目标页面。
修改交互工具时，还应在浏览器检查桌面端、移动端、控制台和异常路径。

## Markdown Studio 约定

### 结构

- `src/components/`：布局、编辑器、预览、侧栏、欢迎页和反馈组件。
- `src/services/`：文件系统、Markdown、导出、搜索、知识图谱和存储服务。
- `src/stores/`：工作区与偏好状态。
- `src/workers/`：搜索 Worker。
- `tests/`：Vitest 与 Sites 产物测试。

使用 Vue 3 Composition API、严格 TypeScript 和现有 `@/` 路径别名。必须保持浏览器本地
处理边界：Markdown 内容、图片和附件不得上传，也不得写入 Cookie、日志或远程数据库。
涉及文件系统、导出、Mermaid、Worker 或对象 URL 时，保留现有的授权、取消和资源释放处理。

### 命令与托管契约

- 开发：`npm run dev`
- 类型检查：`npm run typecheck`
- 单元测试：`npm test`
- 构建：`npm run build`
- 构建产物契约：构建后运行 `npm run test:sites`

保持 `.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs` 和
`tests/sites-worker.test.mjs` 的现有协作关系。部署静态产物使用 `dist/client/`，不要提交
`dist/`。

## Excel 约定

### 结构

- `src/adapters/`：SheetJS、Univer 与标准工作簿模型转换。
- `src/db/`：Dexie 和 IndexedDB 数据访问。
- `src/services/`：工作簿、自动保存、历史、导入导出和备份。
- `src/components/`、`src/views/`：公共组件和页面。
- `src/workers/`：文件导入导出 Worker。
- `tests/`：Vitest、Playwright 和 Sites 产物测试。

优先使用 Vue 3 Composition API、严格 TypeScript 和现有 `@/` 路径别名。遵循项目现有
Prettier/ESLint 格式，不手工修改 `vendor/xlsx-0.20.3.tgz`。

必须保持浏览器本地处理边界：不得上传工作簿或单元格内容，不得引入远程文件转换服务。
修改保存、恢复、历史、图片或导入导出时，要保留 IndexedDB 事务、Worker 终止、对象 URL
释放和兼容性提示等既有保护。

### 命令与托管契约

- 开发：`pnpm dev`
- 类型检查：`pnpm typecheck`
- Lint：`pnpm lint`
- 单元测试：`pnpm test`
- 构建：`pnpm build`
- 构建产物契约：构建后运行 `pnpm test:sites`

保持 `.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs` 和
`tests/sites-worker.test.mjs` 的现有协作关系。构建产物为 `dist/`，不要提交。

## Zitie 约定

### 结构

- `app/*/page.tsx`：各练习模式路由。
- `app/components/`：共享界面和字帖编辑器。
- `app/lib/`：分页、Canvas 绘制、字体、导出和类型。
- `app/config/`：页面内容与配置。
- `public/fonts/`、`public/brand/`：字体和品牌静态资源。
- `scripts/sync-hanzi-data.mjs`：笔顺数据同步。

使用 React 函数组件和严格 TypeScript。延续现有两空格缩进、分号、双引号 import、
PascalCase 组件和 camelCase 函数命名。可复用行为放入 `app/lib/` 或
`app/components/`，不要在路由之间复制。

保持 `next.config.ts` 中静态导出相关配置。`public/hanzi-data/` 由脚本生成，不手工修改，
也不提交。

### 命令与验证重点

- 开发：`npm run dev`
- 类型检查：`npx tsc --noEmit`
- 构建：`npm run build`
- 预览：`npm run start`

涉及分页、Canvas、字体、打印或导出时，浏览器验证应覆盖多页、PNG/PDF/ZIP 导出和打印
结果；同时检查窄屏布局与资源路径。

## PDF 约定

### 结构

- `app/pages/`：首页、工具页和说明页。
- `app/components/`：布局、上传、预览和工作区组件。
- `app/composables/`：页面状态与 PDF Service 编排。
- `app/config/`：工具、SEO 和站点链接配置。
- `core/pdf/`：与页面解耦、可测试的 PDF 处理逻辑。
- `tests/`：单元、集成、夹具和 Playwright 测试。
- `docs/`：架构、处理边界、隐私、测试和部署说明。
- `deploy/nginx.conf`：静态站点 Nginx 示例，不代表当前生产配置。

新工具必须先确认能在浏览器本地稳定完成。处理逻辑放入 `core/pdf/`，不要把
`pdf-lib` 或 PDF.js 操作直接堆在页面中；页面通过 composable 连接状态、取消信号、
错误映射、下载和资源释放。

新增公开工具时，同步维护 `app/config/tools.ts`、静态路由页、`nuxt.config.ts` 预渲染
列表、`public/sitemap.xml` 及必要的 SEO 信息。不得为未实现或无法稳定完成的能力添加
入口。

PDF 文件和图片不得上传，不在 Cookie、日志、统计数据、`localStorage` 或 IndexedDB 中
保存文件内容、文件名历史或缩略图。主题和非敏感界面偏好可以保存在
`localStorage`。对象 URL、Worker、Canvas 和临时缓冲区应在成功、失败、取消与卸载路径
中释放。

### 命令与验证重点

- 开发：`pnpm dev`
- 类型检查：`pnpm typecheck`
- Lint 与格式检查：`pnpm lint`
- 单元测试：`pnpm test`
- 端到端测试：`pnpm test:e2e`
- 静态构建：`pnpm build`

生成内容为 `.nuxt/` 和 `.output/`，不要提交。涉及 PDF 处理时，定向验证正常、损坏、
超限、取消和资源清理路径；涉及界面时检查桌面端、移动端与浏览器兼容回退。

## 验证规则

- 修改后优先执行与改动直接相关的轻量检查，例如语法、格式、类型检查、定向测试或
  `git diff --check`。
- 除非用户明确要求，不主动执行完整编译、完整构建、全量测试或端到端测试。
- 如果只有完整构建才能可靠验证，先说明原因并征得同意。
- 界面或交互改动不能仅凭静态检查判定完成；条件允许时启动目标项目并检查实际页面。
- 最终只报告实际执行过的验证，并明确尚未执行的构建、浏览器检查或生产验证。

## 安全、生成文件与清理

- 不输出或提交真实 API 密钥、令牌、密码、证书、个人文件内容或其他敏感信息；使用环境
  变量或明显占位符。
- 不提交 `node_modules/`、构建目录、测试报告、覆盖率目录、`*.tsbuildinfo`、
  `.DS_Store` 或项目 `.gitignore` 已排除的内容。
- 清理代码或文件前，先区分源码、配置、依赖、缓存、构建产物和用户本地数据，列出拟删除
  目标及依据；不确定用途的文件先查引用和 Git 历史。
- 批量删除、覆盖重要文件、强制推送、改写历史、生产部署、远程资源删除等操作，必须在
  执行前再次确认具体范围、影响和可恢复方式。

## 交付要求

完成任务后简要说明：

- 修改内容及涉及文件。
- 实际执行的检查或测试。
- 未验证事项、兼容性风险或部署前待确认项。

除非用户明确要求，不创建子项目级 `AGENTS.md` 或 `README.md`；需要补充说明时更新根目录
文档，或使用项目现有的 `docs/`、源码注释和配置文件。
