# Meowv Studio

[Meowv Studio](https://studio.meowv.com) 是浏览器内的文件与创作工作台；独立的字帖应用 [Zitie](https://studio.meowv.com/zitie/) 与它共用 Vite 工程。

本地文件、图片和附件在浏览器内处理，不上传到 Studio 后端。翻译工具会向在线服务发送用户提交的文本；壁纸、节假日、版本信息等功能会读取远程数据，外链由浏览器直接访问。

修改边界和验证要求见 [`AGENTS.md`](./AGENTS.md)；仓库脚本与产物映射见 [`../README.md`](../README.md)。

## 本地运行

需要 Node.js 和 pnpm，版本以 [`package.json`](./package.json) 为准。进入本目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:4001，Zitie 位于 /zitie/
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build          # 产物写入 dist/
```

从仓库根目录运行 `./run.sh studio` 或 `./build.sh studio`；后者将产物汇总到 `build/studio.meowv.com/`。完整命令以 [`package.json`](./package.json) 和根目录脚本为准。

## 功能与代码入口

主应用使用 Vue 3、TypeScript；各页面按路由加载。Zitie 使用 React。依赖及版本以 [`package.json`](./package.json) 和锁文件为准。

| 功能          | 用途                         | 源码入口                                      |
| ------------- | ---------------------------- | --------------------------------------------- |
| 首页          | 拖放、粘贴及文件交接         | `src/pages/HomePage.vue`                      |
| Markdown      | 本地工作区、编辑、检索与导出 | `src/features/markdown/`                      |
| Office        | 本地文档编辑与格式转换       | `src/features/office/`                        |
| Books         | 电子书与 PDF 阅读            | `src/features/books/`                         |
| Whiteboard    | 画板与文件导出               | `src/features/draw/`                          |
| Mermaid、Mind | 图表与思维导图编辑           | `src/features/mermaid/`、`src/features/mind/` |
| Notes         | 本地便签                     | `src/features/notes/`                         |
| Wallpapers    | 壁纸浏览、预览与下载         | `src/features/wallpapers/`                    |
| Tools         | 本地工具与外链目录           | `src/features/tools/`                         |
| Zitie         | 独立字帖应用                 | `src/features/zitie/`                         |

主应用菜单见 `src/layouts/StudioShell.vue`，路由见 `src/router/index.ts`。内置工具分类与条目以 `src/features/tools/tools.ts` 为准；外链与书签从 `public/data/tools-links.yaml` 运行时读取。

## 数据与构建

- Zitie 共用 `zitie.html` 源模板；开发时访问 `/zitie/`，构建时生成目录式页面，并将笔顺数据复制到 `dist/zitie/hanzi-data/`。
- 壁纸目录由 [`../wallpapers/`](../wallpapers/README.md) 生成，再由 `scripts/encrypt-wallpaper.mjs` 加密。根目录的 `./build.sh wallpapers` 只生成目录；`./build.sh studio --with-wallpapers` 在构建前生成目录。`public/data/wallpapers.catalog.*` 是生成内容。
- `pnpm build` 输出 `dist/`；根目录 `./build.sh studio` 汇总到 `build/studio.meowv.com/`。发布流程见 [`../README.md`](../README.md)。

## Chat

菜单中的 `/chat` 懒加载匿名聊天室；首页正文保持不变。页面提供昵称加入、Markdown 聊天、历史分页、在线人数、断线补拉、重试和退出会话，适配浅色、深色及窄屏。没有私人房间或文件上传。

Chat 是主动联网的公开交流功能，昵称和消息经服务端转发、存储；历史消息默认不清理，开启服务端消息清理后按配置保留天数。鼠标移入他人消息正文显示回复入口，自己的消息不显示回复；支持取消引用，引用卡片支持定位原消息，并与删除/恢复状态同步。输入 `@` 或点击输入区的 `@` 按钮可搜索在线访客和近期发言者；点击他人昵称可快捷提及，支持方向键选择、Enter/Tab 确认、Escape 关闭。提及按匿名访客 ID 区分重名，选中的提及携带访客 ID，编辑昵称文字会取消该处提及；代码中的同名文字不产生提及。接收方消息高亮，未在当前视野内的提及提供定位提醒；不提供 `@所有人`、离线推送或跨匿名身份追踪。点击输入区自己的头像或昵称可展开匿名身份菜单，选择「退出匿名会话」；菜单支持点击外部和 Escape 关闭。右上角复用主题切换组件，并提供页内管理员验证入口；通过通用授权码验证后，可在消息旁标记删除、恢复或永久删除，操作前确认。授权码仅保留在当前页面内存，退出管理模式或刷新即清除。匿名 Cookie 由服务端设置，页面不读取或持久化会话凭据；Service Worker 不缓存 `/api/chat`。

消息正文保存为 Markdown 原文；支持标题 1–3、粗体、斜体、HTTP/HTTPS 链接、两种列表、引用、行内代码和代码块，不加载图片或执行原始 HTML。输入区直接编辑 Markdown 原文，不提供富文本工具栏和预览；Ctrl/Cmd+B、I、K、E 插入粗体、斜体、链接、行内代码语法，粘贴始终使用纯文本。空行开头输入三个反引号补全代码块围栏，选中文字后输入 `*`、`_`、`` ` ``、`[` 直接包裹（`[` 生成 `[]()` 并把光标放进括号），光标停在闭合标记前输入同一字符时跳过而不重复插入。普通正文 Enter 发送，列表和引用内 Enter 续写（空项返回正文），代码内 Enter 换行，Shift+Enter 始终换行，Ctrl/Cmd+Enter 统一发送；列表、代码或多行选区支持 Tab/Shift+Tab 缩进，支持撤销重做，提及候选和输入法优先处理按键。长度按原文计算，语法标记和链接地址也占服务端额度；超限输入被拒绝，粘贴只插入可容纳的部分并保留已有正文，发送失败保留草稿。引用只显示去除格式后的纯文本摘要。

输入框下方的打字特效菜单提供关闭、彩虹星光（默认）、彩虹粒子、烟花，偏好仅保存到 Studio 本机偏好键。特效只响应成功输入和输入法确认，不响应粘贴、删除、撤销或格式操作；系统减少动态效果、失焦、后台与退出时停止。Canvas 使用单个动画循环，限制粒子数量、生命周期和生成频率，离开页面时释放资源。

开发时 `/api/chat` 的 HTTP 与 WebSocket 默认代理至 `http://127.0.0.1:5000`，可用 `STUDIO_CHAT_API_TARGET` 覆盖。后端默认关闭 Chat，需按 [API 的 Chat 配置说明](../api/README.md#chat-公共聊天室) 开启并配置现有 `Cors:AllowedOrigins`。后端未运行或功能关闭时，页面显示不可用状态。

定向验证：`pnpm exec vitest run src/features/chat`，另执行 `pnpm typecheck` 和改动文件的 ESLint / Prettier 检查。实际部署仍需单独验证裁剪发布、Windows/Nginx、移动端软键盘与目标容量。
