# 近期研发经验沉淀

本文记录 Blog、Meowv Studio 与 Zitie 在近期迭代中反复验证过的工程和协作经验。它是项目说明与 [AGENTS.md](../AGENTS.md) 的补充：前者描述项目如何运行，后者约束协作方式，本文说明为何要采用这些做法以及验收时要关注什么。

## 1. 范围与一致性

- “只调整”“其他页面不动”“不加任何东西”表示严格限定改动面。只移动或复用现有界面时，不额外添加入口、文案或能力。
- 同一产品信息可能分散在路由、桌面和移动菜单、首页快捷入口、渐变或动画中。调整顺序、归属或名称前，先搜索全部重复来源并同步修改。
- 需要对齐兄弟功能时，复用其组件结构和几何基线；目标功能仍保留自己的主题变量。例如 PDF 上传区可沿用 Image 的尺寸与间距，但不能丢失 PDF 的红色主题。
- 局部需求必须保持局部：移动端隐藏冗余控制不等于删除桌面能力；仅 Markdown 页面需要的状态和样式不能泄漏到其他路由。

## 2. 浏览器本地处理边界

- Studio 与 Zitie 的用户文件应始终在浏览器本地读取、处理和导出；不得上传文件内容，也不得写入 Cookie、日志、URL 或远程数据库。
- 本地历史只保存完成该功能所需的最少信息。Office 最近文件只有在首次保存并取得可复用文件句柄后才应出现；文件身份使用 File System Access API 的持久化句柄和 `isSameEntry()`，不要用文件名、大小或修改时间猜测。
- 新窗口或跨工具接力必须把当前 `File` 或已授权的文件句柄交给目标页面，并确认目标页面已经渲染该资源。仅成功打开目标 URL 不算完成。
- 对 PSD、PDF、图像等大文件，先预检文件大小、画布像素和预估解码内存；超出默认阈值时给出明确警告与显式兼容模式，取消、切换文件和卸载时释放 Worker、`ImageBitmap` 与对象 URL。

## 3. 界面与交互验收

- 截图驱动的“对齐”“一致”是渲染验收，不是 CSS 源码验收。应在实际页面检查桌面端、窄屏、深浅色主题、DOM 关系、间距和关键元素的 `getBoundingClientRect()`。
- 遇到“仍然不一致”的反馈，先对比截图与左右面板/子元素的真实尺寸，再做最小修正；不要仅凭计算样式推断结果。
- 工具栏、图标顺序、tooltip 与文案遵循明确要求。自定义 tooltip 已承担提示时，移除重复的原生 `title`；图标按钮仍保留 `aria-label`。
- 移动端优先删减重复信息，而不是压缩掉核心能力；同时检查无横向溢出、触控可达性和桌面回归。

## 4. 本地资源、依赖与运行时

- 需要离线/本地可用的字体、OCR 语言包、编辑器资源和补丁，应明确版本绑定、资源路径、缓存行为与升级步骤。依赖升级后要重新检查补丁是否仍适用。
- Vue 页面中嵌入 React/第三方编辑器时，动态加载并在路由退出时销毁根实例；避免残留事件、动画或编辑器状态。
- Studio 同时存在 TypeScript 源和运行时 JavaScript 镜像的模块时，导出改动必须同步，否则类型检查通过也可能在浏览器中出现缺失导出。
- Monaco 等特殊编辑器的自动化不能依赖隐藏 textarea；使用可访问性/编辑器交互路径验证输入。
- Studio 当前 TypeScript 配置依赖 `baseUrl: "."` 和路径别名；遇到 `TS5103` 时先确认实际解析到的 TypeScript 版本，再处理 `ignoreDeprecations`，不要为了消除报错删除别名基础配置。

## 5. 验证分层与生产问题

验证必须在交付中分层报告，不能以低层检查代替高层结论：

| 层级 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| 语法、格式、`git diff --check` | 文件可解析、补丁基本完整 | 构建、真实交互、线上配置 |
| 类型检查、定向测试 | 类型和被覆盖逻辑正确 | 浏览器布局、真实文件处理、部署 |
| 本地浏览器验证 | 页面布局、交互、控制台和指定文件流程 | 线上缓存、服务器响应头、部署是否成功 |
| 完整构建 | 生产构建链路 | 生产服务器配置和缓存 |
| 服务器与生产浏览器验证 | 实际部署、Nginx、缓存、CSP 和服务资源 | 后续发布不会引入回归 |

- 生产缓存、CSP 或静态资源问题，必须检查实际服务的资源、缓存响应头和浏览器控制台；源码改动或本地空控制台不能代表线上已经修复。
- HTML Meta CSP 与 HTTP 响应 CSP 会同时生效。`blob:` 音视频需要每一份有效策略都允许 `media-src 'self' blob:`。
- Office、Service Worker 或固定文件名补丁更新时，应整体考虑版本化引用、Service Worker 缓存版本、Nginx 缓存头和强制刷新验证。
- 未执行完整构建、真实拖放/OCR/导出、Nginx `-t`/reload 或生产验证时，交付必须明确列为待验收项，不能表述为“已通过”。

## 6. 根脚本与发布产物

- 根目录只维护 Blog、Studio、Zitie 三项目。别名、`all`、多项目参数顺序以及未选择项目的产物保护是脚本契约的一部分。
- macOS Bash 3.2 在 `set -u` 下访问空数组会报错；遍历可为空的选择列表前使用安全的空值保护。
- 构建应先在暂存位置完成，再替换对应发布目录，避免失败时留下半套产物。Zitie 只发布 `dist/client/`，不复制 `dist/server/`。
- 不主动执行生产部署、Nginx reload、远程资源删除或覆盖；这些动作必须在明确授权后进行，并报告影响范围和可恢复方式。
- Vite 配置文件自带的开发端口必须与根脚本、AGENTS.md 的固定端口一致（Blog 4000、Studio 4001、Zitie 4002）。`run.sh` 会以 `--port` 强制覆盖，但不要依赖这一覆盖：`vite.config.ts` 的 `server`/`preview` 端口应当与脚本保持一致，避免直接 `pnpm dev` 时静默占用其他端口。

## 7. 沉浸式编辑器的布局与双引擎集成

- 沉浸式路由（Whiteboard、Mind）不渲染 Studio 默认顶栏和页脚。`StudioShell` 通过 `route.meta.feature` 计算 `isImmersive`，隐藏外壳头部；这些页面自带可折叠自绘顶部栏（偏好存 localStorage）与返回首页入口，全屏画布占满 `.studio-main`。
- Draw 是 Vue 壳 + React（Excalidraw）双引擎：`DrawPage.vue` 在 `onMounted` 动态 import `editor.ts` 并 `createRoot(element)` 挂载，`onBeforeUnmount` 卸载根实例；编辑器代码用 `createElement` 书写、不引入 JSX 构建步骤。第三方编辑器必须延迟加载、路由退出时销毁，避免残留事件与动画。
- React 层自建顶栏、空画布引导、本地画板侧栏、命令面板和重命名/删除/清空对话框，不再依赖 Excalidraw 自带组件；顶部栏可折叠并持久化。`Editor` 的标题、保存状态、画板列表都走 React state，通过 `apiRef`（`excalidrawAPI`）与 Excalidraw 实例交互。
- 主题双向同步：Vue 的 `data-theme` 变化由 `MutationObserver` 读回 `studioTheme` 刷新 React；Excalidraw 的画布 `appState.theme` 变化则回写 `setTheme`，避免两种主题状态分叉。
- Excalidraw 原生菜单文案通过 `MutationObserver` 在渲染后批量替换 `aria-label`/`title`/`placeholder` 和文本节点；自定义 tooltip 已承担提示时移除重复的原生 `title`。
- 白板保存状态机（loading/saved/saving/dirty/failed/unavailable）区分「已保存到原文件」与「已自动保存」；变更防抖（800ms）后写 IndexedDB，并在 `visibilitychange`/`beforeunload` 兜底落盘。写回本地文件使用 File System Access 的 `createWritable`，权限失效记录到阻断集合，下一次保存重新 `requestPermission`；浏览器内副本与原文件写回是两条通道，状态文案和提示要同时覆盖两者。
- Mind 用 adapter 隔离第三方引擎：`VisualMindEditorAdapter` 封装 mind-elixir 的挂载/增删改/缩放/主题/方向，`MarkmapAdapter` 封装 markmap 的 SVG 渲染与缩放，页面不直接依赖第三方 API。
- Mind 支持两类文档（visual 可视化、markdown 分栏预览），工具栏按文档类型切换：可视化视图提供撤销/重做/缩放/适应/布局切换和悬停节点操作（添加子、同级、删除）；Markdown 视图只有缩放/适应，并用可拖拽分隔条控制编辑区与预览区宽度（`--markdown-split` 变量约束在 20%~70%）。
- Mind 主题按文档保存：`settings.themeId` 对应 6 套内建配色，切换时按当前深浅主题取 `accent`/`darkAccent` 生成 `--mind-accent` 系列变量并同步给两个编辑器；`changeMindTheme` 与布局切换后立即 `scheduleSave`。
- Mind 导入导出链路：`.mind` 实际是 ZIP（`manifest.json` + `map.json`/`content.md`），图片导出走 `@zumer/snapdom` 截图（scale 2）；`.json/.md/.txt` 有不同的解析与回退逻辑，导入失败需要给出明确提示并保持原文档不变。
- 保存队列串行化：`saveQueue = saveQueue.then(...)` 保证对 IndexedDB/文件系统的写入不并发交错；切换文档、新建、导入、导出前都先落盘当前文档再操作目标文档。
- 沉浸式页面的验收覆盖：空画布引导、有内容画布、深浅色主题、窄屏无横向溢出、两种文档互切后保存无丢失、文件授权失效后的提示与重新授权、导出 PNG/PDF 等产物与实际浏览器验证。

## 8. 菜单色、页面主题与首页渐变色

- 菜单主题色以 `assets/styles/tokens.css` 为单一来源，`--menu-{image,pdf,ocr,markdown,office,draw,mind}` 及暗色下更亮的 `--menu-{feature}-foreground` 成对定义；各功能页面把对应菜单色锚定为自己的主题令牌，命名并不统一：image(`--primary`/`--color-primary`)、pdf(`--color-primary`)、office(`--brand`)、markdown(`--color-brand` 系)、draw(`--color-brand`)、mind(`--mind-accent` 系)。
- 导航栏每个链接通过 `.nav-{feature}` 设置 `--nav-accent`，激活态下划线使用该色；沉浸式页面用 `--nav-accent` 渲染收起/展开按钮（`studio-header-toggle`）与某些元素。
- 首页「快捷工作台」卡片用 `.home-shortcuts__item--{feature}` 设置 `--shortcut-accent`/`--shortcut-solid` 主题色，与导航、页面主题保持一致；修改菜单名称、颜色或顺序时，按第 1 篇的要点核对所有引用：`tokens.css`、主样式的 `.nav-*` 与 `--nav-accent`、`main.css` 的 `.home-shortcuts__item--*`、各 feature CSS 的锚定变量，最后是首页渐变。
- 首页标题“Meowv Studio”使用 `--studio-menu-gradient` 做 `background-clip: text` 字色渐变，并叠加 `background-position` 动画流动出「颜色滚动」效果；其下的短下划线用同一渐变反向往返运动。渐变色由 7 个菜单色在 `oklch` 空间分段插值（每段约 14.29%）首尾相接，因此对菜单色的修改会同时反映在标题渐变上。
- 渐变类和动画定义在 `.home-copy__product--animated`，白板编辑器内的返回首页按钮与空画布引导也复用该类，保证跨工具首页品牌一致。
- 修改此处颜色时不要只改某一处：在 `tokens.css` 更新 `--menu-{feature}`/`--menu-{feature}-foreground` 后，检索所有 `--menu-{feature}`、`--shortcut-*`、`--nav-accent`、`--color-brand*`、`--mind-accent` 引用，以及 `--studio-menu-gradient` 的插值节点，逐个确认是否需要同步（暗色值与亮色会在渐变和暗色主题中同时出现）。

## 9. 交付清单

每次交付至少说明：

1. 修改了什么、涉及哪些文件，以及哪些相邻区域被刻意保持不动。
2. 实际执行过的检查，并按上节的验证层级说明证据。
3. 尚未验证的浏览器、构建、服务器或生产风险。
4. 若涉及版本补丁、缓存或生产配置，说明升级/回滚和部署时需要执行的后续步骤。
