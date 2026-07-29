# 在线 PDF 处理

一个免费、无需登录、注重隐私的在线 PDF 工具站。用户选择的 PDF 与图片在当前浏览器中读取、预览、处理和导出，网站不提供文件上传接口，也不依赖服务端或第三方文件转换服务。

线上地址：[pdf.meowv.com](https://pdf.meowv.com)

## 首期功能

| 分类     | 工具          | 路由                    |
| -------- | ------------- | ----------------------- |
| 整理 PDF | 合并 PDF      | `/merge-pdf`            |
| 整理 PDF | 拆分 PDF      | `/split-pdf`            |
| 整理 PDF | 整理 PDF 页面 | `/organize-pdf`         |
| 整理 PDF | 删除 PDF 页面 | `/delete-pdf-pages`     |
| 整理 PDF | 提取 PDF 页面 | `/extract-pdf-pages`    |
| 整理 PDF | 旋转 PDF      | `/rotate-pdf`           |
| 转换 PDF | 图片转 PDF    | `/images-to-pdf`        |
| 转换 PDF | PDF 转图片    | `/pdf-to-images`        |
| 编辑 PDF | PDF 添加水印  | `/watermark-pdf`        |
| 编辑 PDF | PDF 添加页码  | `/add-pdf-page-numbers` |
| 编辑 PDF | PDF 元数据    | `/pdf-metadata`         |

站点还包含隐私说明、使用帮助和自愿捐赠页面。捐赠不解锁功能，也不影响工具使用；二维码作为本站静态资源提供，页面不接入支付 SDK。

首页 Footer 同时连接 Meowv 已上线的工具：

- [在线 Excel 处理](https://excel.meowv.com)
- [字帖生成](https://zt.meowv.com)

## 技术栈

- Nuxt 4、Vue 3、TypeScript
- `pdfjs-dist`：PDF 解析、预览、缩略图与图片导出
- `pdf-lib`：PDF 创建、页面复制与编辑
- `jszip`：多文件结果打包
- Vitest、Vue Test Utils、Playwright
- ESLint、Prettier、Stylelint

Nuxt 使用静态生成模式。公开页面在构建阶段预渲染，PDF 处理依赖只在工具页按需加载。

## 环境要求

- Node.js `>= 24`
- pnpm `11.9.0`（以 `package.json#packageManager` 为准）
- 支持 Web Worker、Canvas、Blob 和现代 ES Module 的浏览器

建议使用 Corepack 管理 pnpm：

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm --version
```

## 本地运行

```bash
pnpm install
pnpm dev
```

开发服务器启动后，按终端输出的本地地址访问站点。

## 检查与测试

```bash
# TypeScript / Vue 类型检查
pnpm typecheck

# ESLint、Stylelint 与 Prettier 检查
pnpm lint

# Vitest 单元测试
pnpm test

# Playwright 端到端测试
pnpm test:e2e
```

端到端测试需要先安装对应的 Playwright 浏览器。完整说明见 [docs/testing.md](docs/testing.md)。

## 生产构建

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

静态构建产物位于 `.output/public/`，可以部署到 Nginx 或其他静态文件服务器。仓库提供的示例配置见 [deploy/nginx.conf](deploy/nginx.conf)，部署步骤见 [docs/deployment.md](docs/deployment.md)。

## 隐私原则

- 不上传用户选择的 PDF 或图片。
- 不把文件内容、文件名历史、缩略图或输出文件写入 Cookie、`localStorage` 或 IndexedDB。
- 不在日志或统计数据中记录文件内容与文件名。
- 不修改原始文件，只生成新的下载结果。
- 刷新或关闭页面后，不恢复当前文件工作区。
- 主题、界面偏好、最近使用工具和非敏感默认参数可以保存在 `localStorage`。

浏览器和操作系统仍可能保留页面缓存、下载记录或用户下载的结果文件；基础元数据清理也不等于移除 PDF 中所有潜在隐私信息。完整边界见 [docs/privacy.md](docs/privacy.md)。

## 项目结构

```text
.
├── app/
│   ├── assets/css/          # 设计变量与全局样式
│   ├── components/          # 布局、上传、预览和工作区组件
│   ├── composables/         # 页面状态与 PDF Service 编排
│   ├── config/              # 工具和站点链接统一配置
│   └── pages/               # 首页、工具页及说明页
├── core/pdf/                # 与页面解耦的 PDF 处理逻辑
├── public/                  # robots、sitemap 与静态图片
├── tests/                   # 单元、集成、夹具和 E2E 测试
├── docs/                    # 架构、处理、隐私、部署与测试文档
├── deploy/nginx.conf        # 静态站点 Nginx 示例
├── tools-entry.json         # Meowv 工具列表入口配置
└── nuxt.config.ts           # 静态生成、预渲染与构建配置
```

## 新增工具

1. 先确认能力可以在浏览器本地可靠完成，且不会把用户文件发送到服务器。
2. 在 `app/config/tools.ts` 注册唯一的 slug、名称、说明、分类、文件类型和 SEO 信息。
3. 在 `core/pdf/` 中实现可测试的处理函数，不把 `pdf-lib` 或 PDF.js 操作直接写进页面。
4. 通过 composable 连接工作区状态、取消信号、错误映射、下载和资源释放。
5. 新增对应的静态路由页，并补充 Canonical、Open Graph、FAQ 和结构化数据。
6. 将公开路由加入 `nuxt.config.ts` 的预渲染列表及 `public/sitemap.xml`。
7. 补充单元/集成/E2E 测试，并检查文件未上传、对象 URL 已释放和移动端回退行为。

不得为未实现或无法稳定完成的能力添加首页入口。

## 浏览器支持

优先支持现代 Chrome、Edge、Firefox、Safari、iOS Safari 和 Android Chrome，不支持 Internet Explorer。浏览器缺少特定能力时应使用普通下载、主线程分批渲染等回退方式；大型或复杂 PDF 更适合在内存充足的桌面浏览器中处理。

## 已知限制

- 首期不支持加密或带密码的 PDF。
- 不保证所有损坏、非标准或包含特殊结构的 PDF 都能解析。
- 处理能力受设备内存、页数、页面复杂度和浏览器 Canvas 上限影响。
- 刷新或关闭页面后，当前工作区会清空。
- 基础元数据修改或清理不等于删除 XMP、附件、批注、增量历史等全部潜在隐私信息。
- PDF 转图片会栅格化页面，不保留原始文字、矢量、表单和链接结构。
- 为保证中文兼容性，中文水印或中文页码可能以透明图像形式写入。
- 图片转 PDF 首期只承诺 JPEG、PNG 和 WebP，不承诺 HEIC 或 TIFF。
- 首期不提供 PDF 压缩、PDF 转 Word、OCR、加解密或密码学数字签名。

更多处理细节见 [docs/pdf-processing.md](docs/pdf-processing.md)。
