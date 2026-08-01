# Meowv 上游补丁

相对 `ranuts/document@fcaa66eb92d1759c1ec695f668e7adf2e4c8150b`：

1. 删除 `agent-core`、`chat-ui`、`lib/agent-plugin`、云模型 SDK、WebLLM 与相关测试/入口。
2. 删除可选分析统计，默认且构建时均不采集文件或使用行为。
3. 品牌、域名、中文首页、编辑工作区和静态内容页替换为 Meowv Office。
4. 首页不预加载 OnlyOffice API；仅在打开或新建文档后按需加载。
5. 增加拖拽、单文件限制、核心格式校验、30MB 风险确认与 100MB 默认上限。
6. 远程 URL 仅允许 HTTP(S)，保留 CORS 限制。
7. 增加统一 EditorSession：状态、命名、保存、未保存退出、销毁和 Object URL 释放。
8. 调整 Vite 输出为 `dist/client/`，补充真实 404 和静态服务器部署配置。
9. 更新 PWA 名称、文件关联、缓存命名与用户文档排除策略。
10. 增加 Nginx、兼容性、隐私、安全、字体、测试和性能文档。

上游版权 Header、AGPL 文本、OnlyOffice SDK/Web Apps 版权声明和开放字体许可必须保留。
