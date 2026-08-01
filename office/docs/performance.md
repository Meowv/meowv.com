# 性能与资源

- 上游同源静态资源约 226MB，主要为 OnlyOffice Web Apps、SDKJS、开放字体和 x2t WASM。
- 首页只加载产品壳、样式和小型组件；OnlyOffice API 与 x2t 在打开或新建后按需加载。
- `x2t.wasm.gz` 约 11MB，浏览器解压后内存占用显著增加；初始化 Promise 全局复用。
- SDKJS、Web Apps 和 WASM 使用长期缓存；HTML、Service Worker 和部署耦合资源必须重新验证。
- Service Worker 运行时缓存设有 600 项上限，字体交由浏览器 HTTP 缓存，避免 OnlyOffice 字体加载竞态。

上线前应记录首页传输量、首次编辑器可用时间、四格式保存时间和关闭编辑器后的内存回落。当前文档不
虚构尚未采集的性能数字。
