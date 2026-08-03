# 项目架构

## 目标与边界

在线 PDF 处理是一个静态生成的 Nuxt 应用。服务器只分发 HTML、JavaScript、样式和图片等静态资源，不接收、保存或转换用户文件。

运行时依赖方向保持单向：

```text
页面
  ↓
工作区组件
  ↓
Composable
  ↓
core/pdf Service
  ↓
pdf-lib / PDF.js / Canvas / JSZip
```

页面负责 SEO 和工具说明，组件负责交互，composable 负责状态与任务生命周期，`core/pdf/` 负责可独立测试的处理逻辑。PDF 操作不得反向依赖 Vue 页面。

## 目录职责

```text
app/
  assets/css/       设计变量、响应式布局、浅色/深色主题
  components/       Header、Footer、上传区、预览、参数与结果组件
  composables/      文件工作区、页面状态、任务取消和下载编排
  config/
    tools.ts        工具名称、路由、分类、文件约束和 SEO 的唯一来源
    site.ts         Meowv 站点链接与捐赠资源配置
  pages/            首页、工具页、隐私、帮助和捐赠页
core/pdf/
  merge/            多 PDF 页面复制与合并
  split/            页码分组与多文件输出
  organize/         排序、删除、复制、旋转和页面导出
  convert/          图片与 PDF 互转
  render/           PDF.js 加载、页面预览与图片渲染
  shared/           校验、范围、命名、错误、结果和下载
public/             可直接公开访问的静态资源
tests/              单元、集成、测试夹具和端到端测试
```

## 构建与运行时

`nuxt.config.ts` 使用 Nitro static preset，并显式预渲染首页、11 个工具页、隐私页、帮助页和捐赠页。构建输出位于 `.output/public/`。

首页不应导入 PDF 引擎。工具页进入后再动态加载 `pdfjs-dist`、`pdf-lib`、`jszip` 和相关 Worker 资源，使首屏不承担完整处理引擎体积。

PDF.js Worker 作为构建产物从本站加载，负责 PDF.js 的解析与渲染工作。`pdf-lib` 的文档修改以及部分 Canvas 编码仍在浏览器主线程执行，因此长任务需要：

- 分页或按文件顺序处理，避免无边界并发；
- 暴露阶段进度，不伪造精确百分比；
- 接受 `AbortSignal` 并在可中断边界检查取消；
- 完成、失败或取消后释放 PDF.js 文档、Canvas、大型数组、Blob 和 Object URL。

## 统一数据契约

核心操作使用统一结果结构：

```ts
interface PdfOperationResult {
  success: boolean;
  files: GeneratedFile[];
  warnings: PdfWarning[];
  duration: number;
}
```

错误通过 `PdfErrorCode` 归一化：

```text
INVALID_FILE
CORRUPTED_PDF
ENCRYPTED_PDF
UNSUPPORTED_PDF
OUT_OF_MEMORY
PROCESS_ABORTED
RENDER_FAILED
EXPORT_FAILED
UNKNOWN_ERROR
```

UI 只消费稳定错误码和面向用户的消息，不显示底层堆栈、文件字节或敏感内容。单页渲染失败可以转为警告并继续处理其他页面；无法生成任何结果时才整体失败。

## 工作区状态

每个工具使用同一状态模型：

```text
empty → loading → ready → processing → completed
                    ↘              ↘ failed
```

- `empty`：等待用户选择文件。
- `loading`：读取、校验与解析。
- `ready`：显示预览和参数。
- `processing`：执行处理，可以请求取消。
- `completed`：显示真实生成的文件、大小和耗时。
- `failed`：显示可操作的错误说明，原始文件保持不变。

刷新页面不会恢复文件工作区。主题、界面偏好和非敏感默认参数可以单独持久化，但文件、文件名历史、缩略图和结果 Blob 不得持久化。

## 工具配置

`app/config/tools.ts` 是首页卡片、导航、工具页标题和 SEO 元信息的统一来源。新增工具时应先添加完整定义，再由页面按 slug 读取，避免在多个页面重复硬编码。

公开工具必须同时满足：

1. 有真实可执行的输入、处理和下载闭环；
2. 有唯一的路由、Title、Description、H1 和 Canonical；
3. 有对应的核心处理逻辑和错误处理；
4. 有测试覆盖和静态预渲染配置；
5. 出现在 Sitemap 前已经上线。

## 捐赠模块

`/donate` 是可选支持页面，不属于 PDF 处理链路，不解锁功能。支付宝和微信二维码从 `https://meowv.com/medias/reward/` 加载；页面不接入支付 SDK，也不会把用户文件或处理状态交给支付服务。

用户使用另一应用扫描二维码后的支付行为发生在相应支付服务中，适用该服务自己的规则。捐赠模块与 PDF 文件状态隔离。

## 安全设计

- 文件先验证扩展名、MIME、文件头和实际解析结果。
- PDF.js 禁止依赖动态代码求值，预览器不执行 PDF 内嵌 JavaScript。
- 不自动打开 PDF 中的链接、附件或启动动作。
- 大型二进制在模块间使用 `ArrayBuffer`、`Uint8Array` 和 Blob，不转为 Base64。
- PDF 处理依赖和 Worker 随站点构建，不从公共 CDN 加载。
- Nginx CSP 允许本站 Worker、Blob Worker、Canvas 数据、本地字体和 Google Analytics 所需的脚本与统计请求，同时禁止对象嵌入和其他第三方脚本。

## 扩展原则

PDF 压缩、OCR、PDF 转 Word、加解密和电子签名均不在首期范围。只有在纯浏览器方案经过正确性、性能和隐私验证后才能注册入口；不能通过上传到服务器或第三方服务绕过这一边界。
