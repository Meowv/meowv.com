# Meowv.Api

基于 .NET 10 / ASP.NET Core 的统一后端，提供公共授权、健康检查、接口目录、小米摄像头模块和匿名公共聊天室。Studio 通过 API 访问设备目录、实时预览和云台控制。

| 目录 | 职责 |
| --- | --- |
| `src/Meowv.Api/` | HTTP 宿主、配置、SQLite、认证与 `Modules/` 业务模块 |
| `src/Meowv.Api.Core/` | 公共模块与授权契约 |
| `scripts/` | 发布、FFmpeg 准备与运行时定向检查 |
| `tests/` | 使用合成数据和临时目录的定向检查 |

模块开发与修改边界见[协作指南](AGENTS.md)。

## 根目录与配置

开发根目录为 `src/Meowv.Api/`；发布后默认使用可执行文件所在目录。根目录直接存放 `appsettings.json`、本机 `appsettings.Development.json` 和 `api.db`。可用 `--contentRoot <绝对目录>` 或标准宿主环境变量指定其他根目录。数据库和 FFmpeg 的相对路径都以该根目录为基准，不受进程工作目录影响。

配置按下列顺序覆盖，修改后重启生效：

1. `appsettings.json`：可提交、可发布的普通配置，密钥字段留空。
2. `appsettings.{Environment}.json`：可选环境配置；开发环境使用 `appsettings.Development.json`，保存本机配置和开发密钥，不提交、不复制到构建输出或发布包。
3. 环境变量，分区用 `__` 表示。
4. 命令行参数。

按标准环境名加载配置，不额外加载 User Secrets。生产不加载 `appsettings.Development.json`，密钥通过环境变量提供。公共管理密钥需预先配置；缺少时启动校验失败，只提示配置项名称。应用授权码在初始化向导中生成，两者用途不同。

| 配置项 | 默认值 / 含义 |
| --- | --- |
| `ConnectionStrings:DefaultConnection` | `Data Source=api.db`；支持配置 SQLite 文件路径，统一连接工厂解析为绝对路径 |
| `Security:BootstrapToken` | 公共管理密钥，至少 32 字符；用于生成、轮换应用授权码，以及模块初始化与重绑 |
| `Cors:AllowedOrigins` | 精确 Origin 数组；默认空，按部署需要配置，不从其他环境继承本机 Origin |
| `Tools:FFmpeg:Path` | 可选 FFmpeg 路径；显式配置无效时不回退 |
| `Modules:XiaomiCamera:Enabled` | 默认 `true`；禁用时不初始化摄像头服务、创建摄像头表或检查 FFmpeg |
| `Modules:XiaomiCamera:MaxConcurrentStreams` | 默认 `2`，包括回收中的设备媒体流；同一设备共享容量 |
| `Modules:XiaomiCamera:Media:Profile` | 默认 `server`：最高 720p / 15 fps；`development`：最高 1080p / 25 fps；不会放大低分辨率视频 |

新安装可手动创建本机 `appsettings.Development.json`。下面均为占位符，须替换成独立生成的随机值；也可先禁用摄像头，仅使用公共功能：

```json
{
  "Security": { "BootstrapToken": "YOUR_RANDOM_MANAGEMENT_TOKEN_AT_LEAST_32_CHARACTERS" },
  "Cors": { "AllowedOrigins": ["http://127.0.0.1:4001", "http://localhost:4001"] },
  "Modules": { "XiaomiCamera": { "Enabled": false } }
}
```

需要摄像头时将 `Enabled` 改为 `true`，并准备包含 `libx264` 的 FFmpeg；查找顺序见[发布说明](#发布)。`Cors:AllowedOrigins` 只填写实际使用的前端 Origin，同域访问不需要跨域配置。

生产示例配置项名：`Security__BootstrapToken`、`ConnectionStrings__DefaultConnection`、`Tools__FFmpeg__Path`。Origin 数组使用 `Cors__AllowedOrigins__0` 等索引。不要通过命令行传递真实密钥，也不要打印配置转储。

## 启动与授权

仓库根目录执行 `./run.sh api`。本地启动配置使用 `Development`；根脚本显式指定项目内容根目录。直接启动可使用：

```bash
dotnet run --project api/src/Meowv.Api -- --contentRoot /YOUR_CHECKOUT/api/src/Meowv.Api
```

默认地址为 `http://localhost:5000`，启动参数可通过标准 `--urls` 覆盖。

打开 `http://localhost:5000/setup`，在统一初始化向导中输入一次公共管理密钥：首次使用自动生成服务级授权码，然后检查摄像头模块并引导账号登录或验证码验证；已有授权码和保存的云会话自动保留。摄像头未启用或初始化失败时，系统授权仍可使用，页面显示模块状态并提供重新检查。

一个授权码通用于所有声明公共授权的模块，客户端使用 `Authorization: Bearer YOUR_ACCESS_CODE`。服务只保存盐和 PBKDF2 哈希；已有授权码不会再次返回明文，遗失后只能在向导中手动轮换。轮换立即废止旧授权码，并使旧摄像头播放票据失效。切换小米账号单独确认，不轮换公共授权码。授权状态保存在共享数据库的 `auth_state` 中，不依赖摄像头开关或小米登录状态。管理密钥只保留在当前页面内存，刷新或退出管理后重新验证。

| 接口 | 授权与行为 |
| --- | --- |
| `GET /api/health` | 宿主匿名存活探针，不检查模块依赖 |
| `GET /api/modules` | 已装配模块及接口清单，不表示业务就绪 |
| `GET /api/docs` | 按模块查看接口路径、请求方式和认证要求，支持搜索与筛选 |
| `GET /setup` | 统一初始化向导：系统授权码和摄像头登录，密钥只保留在页面内存 |
| `POST /api/auth/access-code` | `X-Api-Bootstrap-Token`；首次返回授权码，已存在时返回 `accessCode: null` |
| `POST /api/auth/access-code/rotate` | 同上；轮换所有模块共用的授权码 |
| `/api/xiaomi-camera/setup/...` | 同样使用 `X-Api-Bootstrap-Token`；小米账号登录、验证码验证和会话重置 |
| `GET /api/xiaomi-camera/health` | 摄像头就绪状态；未就绪 `503`，禁用时不注册 |

公共管理接口有限流，超过额度统一返回 `429`，授权码响应及初始化页面禁止缓存。宿主在限流前处理转发头，只信任本机 IPv4 / IPv6 回环代理的一跳 `X-Forwarded-For` 和 `X-Forwarded-Proto`；适用于仓库 Nginx 转发到 `127.0.0.1:5000` 的布局，其他来源的转发头不生效。普通业务通过标准认证 Scheme 校验 Bearer 授权码，缺失或错误返回 `401 access_code_unauthorized`，在业务参数绑定前拦截；管理密钥不代替应用授权码。摄像头管理接口位于 `/api/xiaomi-camera/setup/...`，公共授权码由 `/api/auth/...` 管理。

## 接口目录

打开 `http://localhost:5000/api/docs`，按模块查看当前注册的接口；可搜索模块名、路径、请求方式和认证要求。目录只展示清单，不提供接口调用或调试功能。需要程序读取时，使用 `GET /api/modules`：每个模块包含 `name`、`description`、`endpoints`，接口包含 `path`、`methods`、`authorization`。

目录与模块清单允许匿名访问，只返回路由元数据。内容从运行时路由自动收集，包含已注册但暂不可用的模块，已禁用的摄像头模块不进入目录，Chat 禁用时只保留健康探针；接口是否可用仍以模块健康接口和实际响应为准。认证要求区分匿名、通用授权码、管理密钥及模块自行校验的播放票据。

## 发布

仓库根目录执行 `build.sh` 时，应用先发布到 `api/build/<RID>/`，再汇总到 `build/studio.meowv.com/api/<RID>/`。单独运行 `publish.sh` 只生成项目发布目录，也可用 `--output <目录>` 指定发布根目录。

```bash
./build.sh api                       # 默认 win-x64
./build.sh api --rid linux-x64
cd api
bash scripts/publish.sh --rid osx-arm64
bash scripts/publish.sh --rid linux-x64 --without-ffmpeg
```

每个 `<RID>/` 是独立发布目录，主程序保持自包含、完整裁剪和压缩单文件；无密钥的 `appsettings.json`、FFmpeg 和来源校验记录 `SOURCE.txt` 均放在主程序旁。例如 Windows x64：

```text
win-x64/
├── Meowv.Api.exe
├── appsettings.json
├── ffmpeg.exe
└── SOURCE.txt
```

其他平台使用对应 RID；Linux 和 macOS 的主程序和 FFmpeg 不带 `.exe` 后缀。FFmpeg 显式路径优先，否则查找内容根目录旁置文件；开发环境还会查找 `api/build/<当前 RID>/`，最后回退到系统 `PATH`。重复发布仍校验并复用相同版本的 FFmpeg。`appsettings.Development.json`、数据库及其附属文件不进入应用发布或根脚本暂存包。`--without-ffmpeg` 只跳过工具准备，不清理已有 FFmpeg，也不自动禁用摄像头。

首次部署先配置公共管理密钥，启动后通过 `/setup` 生成授权码并登录小米账号。后续升级保留数据库与生产配置；可用 `ConnectionStrings__DefaultConnection` 将数据库放到静态站点和发布目录之外。上传流程见[根 README](../README.md#上传到-windows-nginx)，发布和上传脚本均不注册或重启服务。

宿主存活检查为 `/api/health`，摄像头就绪检查为 `/api/xiaomi-camera/health`。模块初始化失败时查看模块健康响应和服务日志中的失败阶段，核对配置、数据库及 FFmpeg；宿主存活不表示摄像头已就绪。

## Windows NSSM 服务

将独立的 Windows 平台目录上传到服务器，在管理员终端执行以下命令；路径按实际发布位置调整，NSSM 需已加入 `PATH`：

```powershell
nssm install Meowv.Api "C:\_qix\studio.meowv.com\api\win-x64\Meowv.Api.exe"
nssm set Meowv.Api AppDirectory "C:\_qix\studio.meowv.com\api\win-x64"
nssm set Meowv.Api AppEnvironmentExtra "DOTNET_ENVIRONMENT=Production" "ASPNETCORE_ENVIRONMENT=Production" "ASPNETCORE_URLS=http://localhost:5000"
nssm set Meowv.Api Start SERVICE_AUTO_START
nssm edit Meowv.Api
```

在 Environment 中保留已有行，添加 `Security__BootstrapToken=YOUR_RANDOM_MANAGEMENT_TOKEN_AT_LEAST_32_CHARACTERS`，按需配置数据库路径和跨域 Origin。不要勾选 Replace default environment；真实密钥只填入服务器配置，不写入脚本或命令行。保存后执行 `nssm start Meowv.Api`。升级前停止服务，完成程序替换后再启动；创建服务后保持 NSSM 程序路径不变。

## 脚本与验证

| 脚本 | 作用 |
| --- | --- |
| `scripts/publish.sh` | 自包含单文件发布；准备或复用校验通过的 FFmpeg |
| `scripts/fetch-ffmpeg.sh` | 下载固定版本的校验清单与 FFmpeg 压缩包，校验后提取并记录来源 |
| `scripts/check-runtime.sh` | 使用本机包缓存建立临时测试宿主，执行运行时定向检查 |

以下命令从仓库根目录执行：

```bash
bash api/scripts/check-runtime.sh
node --test api/tests/setup-page.test.mjs
node --test api/tests/publish-layout.test.mjs
```

`RuntimeChecks.cs` 检查配置优先级、接口目录、公共授权、持久化、可信代理、限流及票据撤销；`ModuleInitializationChecks.cs` 检查模块故障隔离，登录和媒体依赖使用占位类型；`FfmpegPathChecks.cs` 在 Unix 上用合成可执行文件检查 FFmpeg 路径解析。它们由 `check-runtime.sh` 统一运行。

`setup-page.test.mjs` 使用内存 DOM 和合成响应检查初始化、验证码、模块故障、授权码轮换及退出清理；`publish-layout.test.mjs` 使用发布和下载替身检查各 RID 的目录布局、缓存校验和打包白名单。

这些检查不构建完整 API，不连接真实账号或摄像头，也不执行真实发布。完整构建、目标平台启动、真实设备预览及生产验证需分别确认。

## Chat 公共聊天室

Chat 挂载在 `/api/chat`，复用当前 SQLite、宿主和管理认证。默认 `Modules:Chat:Enabled=false`，不注册聊天 Hub 和写接口，也不创建 Chat 表。前端入口为 Studio 菜单 `/chat`，首页正文不展示 Chat。

启用前通过环境变量设置 `Modules__Chat__Enabled=true`，并在**现有** `Cors:AllowedOrigins` 中列出 Studio 的精确 Origin，例如生产的 `https://studio.meowv.com` 或开发的 `http://localhost:4001`。Chat 不维护第二份来源白名单；写接口与所有 Hub 传输均用这份配置校验 Origin，来源未配置时模块保持不可用。Chat 管理使用 `/setup` 生成的通用授权码，不使用 `Security:BootstrapToken`。模块状态为 `GET /api/chat/health`，初始化或 SQLite 故障只影响 Chat。

完整 Chat 配置列在 [`appsettings.json`](src/Meowv.Api/appsettings.json) 中，默认值定义在 [`ChatOptions.cs`](src/Meowv.Api/Modules/Chat/ChatOptions.cs)，可用 `Modules:Chat:<名称>` 覆盖：

| 配置 | 默认值 | 作用 |
| --- | --- | --- |
| `Enabled` | `false` | 启用 Chat 模块 |
| `MessageCleanupEnabled` | `false` | 启用历史消息过期过滤和自动清理；关闭时不按时间过滤或删除消息 |
| `RetentionDays` | `7` | 开启消息清理后保留最近多少天的消息（1–365） |
| `SessionDays` | `7` | 固定匿名会话有效期 |
| `AuditRetentionDays` | `30` | 管理操作审计保留期 |
| `HistoryPageSize` / `MaxHistoryPageSize` | `30` / `100` | 历史分页默认值与单次最大数量（最多 100） |
| `MaxMessageChars` / `MaxMessageBytes` | `500` / `2048` | NFC 规范化后的用户可见字符和 UTF-8 字节上限 |
| `SendCooldownMs` / `MessagesPerMinute` | `2000` / `20` | 单访客发送间隔和每分钟配额 |
| `IpMessagesPerMinute` | `100` | 单 IP 每分钟消息配额 |
| `SessionsPerWindow` / `SessionWindowMinutes` | `5` / `10` | 单 IP 会话创建配额与窗口 |
| `MaxConnectionsPerGuest` / `MaxConnections` | `5` / `100` | 单访客、单实例连接上限；非压测容量承诺 |
| `CleanupMinutes` / `CleanupBatchSize` | `60` / `500` | 每轮分表分批清理；积压时缩短间隔继续处理 |
| `BlockedNicknameTerms` | `[]` | 禁用昵称包含词，大小写不敏感 |

消息清理默认关闭。设定 `Modules:Chat:MessageCleanupEnabled=true` 后，历史接口立即排除超过 `RetentionDays` 的消息，后台按 `CleanupMinutes` 分批物理删除。关闭消息清理不影响过期会话和管理审计的清理。页面从状态接口读取开关，仅在开启时显示消息保留天数。配置修改后重启 API 生效。

会话 Cookie 为 `meowv_chat_session`，`HttpOnly`、`SameSite=Strict`、路径 `/api/chat`；生产必须 HTTPS，并设置 `Secure`。令牌只以 SHA-256 哈希保存在 `chat_guest_sessions`。消息和管理审计使用 `chat_messages`、`chat_moderation_logs`，均在共享数据库内，升级时保留数据库。匿名访客可主动发送的公开聊天文本属于联网数据，不涉及本地文件上传。

| 路径 | 用途 |
| --- | --- |
| `POST /api/chat/session` | `{ "nickname": "访客" }` 创建或复用匿名会话 |
| `GET` / `DELETE /api/chat/session` | 查询、撤销会话；退出立即断开该访客所有连接 |
| `GET /api/chat/messages` | `beforeId` 或 `afterId` 分页，默认 30，最多 100；ID 为十进制字符串 |
| `GET /api/chat/messages/{id}/context` | 按消息 ID 加载原消息及附近消息，提供向前/向后分页状态 |
| `GET /api/chat/participants` | 提及候选名单：在线访客和最近 200 条可见消息的作者，按访客 ID 去重，最多 200 人 |
| `GET /api/chat/status` | 去重在线人数、服务时间、当前消息限制及保留天数 |
| `/api/chat/hub` | SignalR：`SendMessage(clientMessageId, content, replyToId, mentions)`；推送 `message.created`、`message.deleted`、`message.restored`、`presence.changed` |
| `POST /api/chat/admin/messages/{id}/restore` | 恢复已标记删除的消息及原文，广播恢复事件；物理删除的消息无法恢复 |
| `GET /api/chat/admin/session` | 验证通用授权码，成功返回 204；独立限制验证频率 |
| `DELETE /api/chat/admin/messages/{id}?permanent=false` | 标记删除，保留数据库原文但不返回正文；`permanent=true` 物理删除；广播事件并记录审计 |

除会话创建、退出外，业务接口要求匿名 Cookie；Chat 管理接口使用现有通用授权码 `Authorization: Bearer YOUR_ACCESS_CODE`。浏览器写接口要求白名单 `Origin` 和 `X-Chat-Request: 1`，Hub 使用 Origin 校验。命令行管理工具也需提供同样的 Origin 和写请求头。默认标记删除并保留数据库正文，接口隐藏原文；传入 `permanent=true` 则物理删除整条消息。删除和恢复均记录审计并实时通知访客，已标记消息可恢复或永久删除；管理入口位于 Chat 页右上角，输入通用授权码验证后可在消息旁选择标记删除、恢复或永久删除；授权码仅保留在当前页面内存，退出管理模式或刷新后清除，不写入浏览器持久化存储。没有独立管理页面。

消息引用仅保存原消息 ID（`chat_message_replies`），昵称和最多 120 个可见字符的摘要由后端关联原消息生成，不保存正文副本。标记删除时隐藏摘要，恢复后重现；物理删除或过期后显示原消息不可用，回复本身保留。鼠标移入他人消息正文显示回复，自己消息不显示回复；授权后的管理操作仍可使用，键盘聚焦同样可用，触屏直接显示操作入口；点击引用定位原消息，尚未加载时展示附近消息，可继续加载更早/较新消息或回到最新。

提及通过访客 ID 与正文中的 UTF-16 起始位置、长度关联，每条消息最多 10 次；后端核对访客身份和 `@昵称` 文本，不按昵称猜测身份。正文与提及元数据在同一事务保存（`chat_message_mentions`），幂等重试保留原目标；标记删除时接口隐藏正文及提及，恢复后重现，物理删除同时移除关系。候选名单需要匿名会话，只有公开昵称、头像种子、访客 ID 和在线状态，不返回会话凭据或 IP。只有从候选列表选择或点击昵称插入的提及会产生提醒，普通 `@文字` 不会。

仓库 `nginx.conf` 已准备 `/api/chat/` 的 WebSocket Upgrade 代理和同域 WSS CSP；它们需要部署后才生效。本地开发可通过 `STUDIO_CHAT_API_TARGET=http://127.0.0.1:15000 pnpm dev` 指定开发代理目标（默认 `http://127.0.0.1:5000`），避免占用已有服务端口。

定向检查：`bash scripts/check-chat.sh`，只使用本机已有 NuGet 缓存、临时项目、合成凭据和临时数据库，验证 REST、真实 WebSocket 协议、源生成 JSON、幂等、限流、管理、清理和故障隔离；临时产物保留在系统临时目录便于诊断。它不构建完整 API，也不等同于完整裁剪的发布检查、Windows/Nginx 验证、移动端实机验证或并发压测。
