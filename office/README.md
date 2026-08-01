# Meowv Office

Meowv Office 是纯前端、浏览器本地运行的 Office 文档编辑器。无需安装或登录，可打开、编辑并保存
DOCX、XLSX、PPTX 和 CSV；本地文件内容不上传到 Meowv 或第三方编辑器实例。

## 技术边界

- OnlyOffice Web Apps + SDKJS 提供编辑界面。
- x2t WebAssembly 在浏览器内完成 Office 文件与编辑器二进制格式之间的转换。
- Vite 输出静态目录，不依赖业务后端、数据库、用户系统或云文件库。
- 编辑器、WASM、字体与业务脚本全部同源自托管。
- 不执行 VBA、宏、ActiveX、嵌入脚本，不提供 AI、多人协作或云端自动保存。

上游基线固定为 `ranuts/document` 提交：

```text
fcaa66eb92d1759c1ec695f668e7adf2e4c8150b
```

该基线中的 AI、云模型与聊天面板模块未引入 Meowv Office。详情见
[docs/upstream.md](docs/upstream.md) 和 [docs/upstream-patches.md](docs/upstream-patches.md)。

## 本地开发

环境：Node.js `>= 20.19.0`、pnpm `11.4.0`。

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

开发地址固定为 `http://localhost:4006`。

## 验证与构建

```bash
corepack pnpm tsc
corepack pnpm lint
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm build
```

生产静态资源输出到 `dist/client/`，由根目录 `build.sh` 汇总后自行部署到服务器。

## 支持范围

| 格式 | 打开 | 编辑 | 新建         | 保存                   |
| ---- | ---- | ---- | ------------ | ---------------------- |
| DOCX | 是   | 是   | 是           | DOCX                   |
| XLSX | 是   | 是   | 是           | XLSX                   |
| PPTX | 是   | 是   | 是           | PPTX                   |
| CSV  | 是   | 是   | 通过表格新建 | CSV；复杂内容建议 XLSX |

旧格式 DOC、XLS、PPT 仅保留上游兼容读取入口，不作为首发兼容性承诺。密码文件、DRM、宏和
ActiveX 不支持。

## 路由与查询参数

- `/`：产品首页和本地文件入口。
- `/?new=docx|xlsx|pptx`：新建文档。
- `/?src=https://...` 或 `/?file=https://...`：打开允许 CORS 的 HTTP(S) 远程文件。
- `/?readonly=1`：只读模式。
- `/?embed=1`：嵌入模式。
- `/doc/`、`/xls/`、`/ppt/`、`/csv/`：Vue 格式入口页，可从静态托管环境直接访问。

隐私、使用说明与开源许可已整合到首页，不再维护独立静态内容页。

未知路径返回真实 404，不回退到应用首页。

## 隐私说明

本地文件仅在浏览器内存、临时 Object URL 和 x2t 虚拟文件系统中处理。最近使用与回收站仅在当前设备的
IndexedDB 中保留文件名、格式、大小、打开/保存/删除时间，以及支持浏览器中经用户授权的文件句柄；不保存
文件内容或缩略图。通过 Chromium 文件选择器授权打开的文件会自动回写原文件。Service Worker 不缓存带
`file` 或 `src` 参数的文档请求，也不缓存用户文件内容。

完整说明见 [docs/privacy.md](docs/privacy.md) 和 [docs/security.md](docs/security.md)。

## 许可证

Meowv Office 的编辑核心基于 AGPL-3.0 的 `ranuts/document`，保留上游和 OnlyOffice 版权声明。
公网部署修改版本时，必须向用户提供对应源码。字体只使用带明确开放许可的文件；不得私自加入
Arial、Times New Roman、微软雅黑等未授权字体。

本项目不提供任何明示或暗示的兼容性、适销性或特定用途担保。
