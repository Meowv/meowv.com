# Meowv Web Projects

这是 Meowv 旗下 4 个 Web 项目的统一代码仓库。各项目位于独立目录，拥有各自的依赖、
开发命令和构建产物；仓库根目录目前不提供统一的工作区脚本。

## 项目概览

| 目录     | 项目                 | 技术栈                                     | 状态   | 地址                                       |
| -------- | -------------------- | ------------------------------------------ | ------ | ------------------------------------------ |
| `blog/`  | 个人博客与 Labs 工具 | Hexo 7、EJS、Stylus                        | 已上线 | [meowv.com](https://meowv.com)             |
| `excel/` | 在线 Excel 处理      | Vue 3、TypeScript、Vite、Univer、SheetJS   | 已上线 | [excel.meowv.com](https://excel.meowv.com) |
| `zitie/` | 在线字帖生成         | Vinext、Next.js 16、React 19、TypeScript   | 已上线 | [zt.meowv.com](https://zt.meowv.com)       |
| `pdf/`   | 在线 PDF 处理        | Nuxt 4、Vue 3、TypeScript、PDF.js、pdf-lib | 待上线 | 规划域名 `pdf.meowv.com`                   |

## 仓库结构

```text
.
├── blog/       # 博客、文章、独立游戏和 Labs 工具
├── excel/      # 浏览器端电子表格应用
├── zitie/      # 浏览器端字帖生成与导出应用
├── pdf/        # 浏览器端 PDF 工具站
├── AGENTS.md   # 全仓库协作与修改约定
└── README.md   # 项目总览
```

4 个目录不是 npm/pnpm workspace。安装依赖、开发、检查和构建时，应先进入目标项目目录，
不要在仓库根目录混用包管理命令。

## 环境与常用命令

### Blog

- 环境：Node.js；依赖锁文件为 `yarn.lock`
- 安装：`cd blog && yarn install --frozen-lockfile`
- 开发：`yarn server`
- 构建：`yarn clean && yarn build`
- 产物：`blog/public/`

站点内容位于 `blog/source/`，主题模板与资源位于
`blog/themes/hexo-theme-matery/`。文章放在 `source/_posts/`；独立页面和静态资源也从
`source/` 管理。`source/games/` 下的独立应用跳过 Hexo 渲染。

一个常规 Labs 工具通常包含：

- `source/tools/<slug>/index.md`
- `themes/hexo-theme-matery/layout/tools/<slug>.ejs`
- `source/_data/tools.json` 中的入口配置

### Excel

- 环境：Node.js `>= 22.12.0`、pnpm `11.9.0`
- 安装：`cd excel && pnpm install --frozen-lockfile`
- 开发：`pnpm dev`
- 类型检查：`pnpm typecheck`
- 代码检查：`pnpm lint`
- 单元测试：`pnpm test`
- 生产构建：`pnpm build`
- Sites 产物契约测试：构建后运行 `pnpm test:sites`
- 产物：`excel/dist/`

这是纯前端电子表格应用，工作簿在浏览器内解析和处理，主要保存在 IndexedDB，不提供文件
上传或服务端转换能力。应用支持本地工作簿管理、编辑、历史版本、导入导出、整库备份、
打印和 PWA 离线访问。

主要代码位于 `excel/src/`：

- `adapters/`：SheetJS、Univer 与标准工作簿模型之间的转换
- `db/`：Dexie 数据库和数据访问层
- `services/`：保存、历史、导入导出和备份等业务逻辑
- `views/`、`components/`：页面与界面组件
- `workers/`：文件导入和导出 Worker

`.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs` 和
`tests/sites-worker.test.mjs` 共同维护当前托管构建契约。

### Zitie

- 环境：Node.js `>= 22.13.0`、npm
- 安装：`cd zitie && npm ci`
- 开发：`npm run dev`
- 类型检查：`npx tsc --noEmit`
- 生产构建：`npm run build`
- 预览构建：`npm run start`
- 产物：`zitie/dist/`

字帖应用使用浏览器 Canvas 完成分页、绘制、打印，以及 PNG、PDF、ZIP 导出。当前覆盖
汉字、词语、中文段落、笔画、拼音、英文字母、英文单词与段落、数字和控笔练习。

路由页位于 `zitie/app/`，共享组件位于 `app/components/`，分页、绘制、字体和导出逻辑
位于 `app/lib/`。`npm run dev` 和 `npm run build` 会先运行
`scripts/sync-hanzi-data.mjs`，生成运行时所需的 `public/hanzi-data/`。

### PDF

- 环境：Node.js `>= 24.0.0`、pnpm `11.9.0`
- 安装：`cd pdf && pnpm install --frozen-lockfile`
- 开发：`pnpm dev`
- 类型检查：`pnpm typecheck`
- 代码与格式检查：`pnpm lint`
- 单元测试：`pnpm test`
- 端到端测试：`pnpm test:e2e`
- 生产构建：`pnpm build`
- 产物：`pdf/.output/public/`

PDF 项目已经完成首期开发，尚未上线。它使用静态生成模式，文件读取、预览、处理和导出
均在当前浏览器内完成，不提供文件上传接口，也不依赖服务端或第三方文件转换服务。

当前工具包括：

| 分类     | 工具                                           |
| -------- | ---------------------------------------------- |
| 整理 PDF | 合并、拆分、页面整理、删除页面、提取页面、旋转 |
| 转换 PDF | 图片转 PDF、PDF 转图片                         |
| 编辑 PDF | 添加水印、添加页码、修改元数据                 |

页面与界面代码位于 `pdf/app/`，与页面解耦的处理逻辑位于 `pdf/core/pdf/`。架构、隐私、
处理边界、测试和部署说明保存在 `pdf/docs/`。

## 隐私与安全边界

Excel、Zitie 和 PDF 都以浏览器本地处理为核心。修改相关功能时必须保持以下边界：

- 不把用户选择的表格、PDF、图片或其内容发送到第三方服务。
- 不在日志、统计信息或 URL 中记录文件内容和敏感文件信息。
- 不执行工作簿宏、PDF 内嵌脚本或其他不受信任的主动内容。
- 新增外部服务、文件上传、远程转换或遥测前，必须先明确说明并取得授权。

各应用的数据持久化策略不同：Excel 使用 IndexedDB 保存工作簿；Zitie 可以保存非敏感
练习设置；PDF 刷新或关闭页面后不恢复文件工作区。不要在项目之间直接套用存储逻辑。

## 生成内容

以下目录或文件由安装、开发或构建过程生成，不应手动修改或提交：

- 通用：`node_modules/`、`.DS_Store`
- Blog：`public/`、`db.json`
- Excel：`dist/`、`.pnpm-store/`、`coverage/`、`playwright-report/`、
  `test-results/`、`*.tsbuildinfo`
- Zitie：`public/hanzi-data/`、`dist/`、`.vinext/`、`.next/`、`*.tsbuildinfo`
- PDF：`.nuxt/`、`.output/`、`dist/`、`coverage/`、`playwright-report/`、
  `test-results/`

## 开发与发布

- 修改只应落在目标项目及必要的根目录文档中，避免顺手重构其他项目。
- 使用目标项目现有的包管理器和锁文件，不跨项目安装依赖。
- 根据改动范围执行类型、Lint、单元测试或浏览器检查；完整构建不是所有小改动的默认步骤。
- `yarn deploy`、生产环境部署、Nginx 修改、域名切换和远程资源操作必须在明确授权后执行。
- 当前仓库没有统一许可证；使用、分发或二次开发前，应分别确认各项目的授权情况。

更具体的协作规则见根目录 [AGENTS.md](./AGENTS.md)。
