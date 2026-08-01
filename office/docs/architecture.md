# 架构

```text
首页和静态内容页
        │
        ▼
EditorSession ── 文件选择 / 拖拽 / URL
        │
        ▼
document.ts ── 格式与生命周期编排
        │
        ├── converter.ts ── x2t WASM / CSV-SheetJS 转换
        │
        └── onlyoffice-editor.ts ── DocEditor、事件与保存
                                │
                                ▼
                   File System Access / 浏览器下载
```

`packages/shared` 只保存类型、i18n、状态和文档工具；`packages/converter` 隔离转换器；
`lib/onlyoffice-editor.ts` 隔离 OnlyOffice 事件；`lib/editor-session.ts` 管理产品层会话。

同时只允许一个活动编辑器，创建和销毁经队列串行化。切换文件前销毁旧实例并释放已登记的 Object
URL。WASM 初始化 Promise 复用；失败后可重新尝试。
