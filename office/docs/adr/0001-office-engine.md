# ADR 0001：采用浏览器版 OnlyOffice 与 x2t WASM

- 状态：已接受
- 日期：2026-08-01

## 背景

现有 Univer 编辑器适合表格，但不能作为 Word 和 PowerPoint 的统一编辑内核。产品要求纯前端、
不上传文件、支持 DOCX/XLSX/PPTX/CSV，并保持静态部署。

## 决策

新建独立 `office/`，固定 `ranuts/document` 上游提交，采用其 OnlyOffice Web Apps、SDKJS 与 x2t
WebAssembly 链路。现有 `excel/` 保持不动，两个项目不共享运行时内核。

## 结果

- 优点：四格式共用成熟编辑界面；文件转换留在浏览器；静态部署；旧 Excel 可独立回滚。
- 代价：静态资源约 226MB；首次加载和浏览器内存成本较高；复杂 Office 兼容性仍需真实样本回归。
- 约束：资源必须按需加载并长期缓存；不得同时把 Univer 打进 Office 生产包；不得引入上游 AI 模块。

## 未采用方案

- 在 Univer 上拼接 Word/PPT 编辑器：双内核且无法统一格式保存。
- iframe 第三方在线编辑器：文件可能离开站点、离线和版本控制不可控。
- 服务端 Document Server 或转换 API：违反纯前端和无业务后端边界。
