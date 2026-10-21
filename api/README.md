# Meowv.Api

统一的 .NET 10 / ASP.NET Core 后端。解决方案只有 `Meowv.Api` 和 `Meowv.Api.Core` 两个项目：前者包含宿主、公共配置/存储/认证及业务模块，后者保存模块与公共授权契约。所有业务模块位于宿主 `Modules/`，不新增模块类库。

## 根目录与配置

开发根目录为 `src/Meowv.Api/`；发布后默认使用可执行文件所在目录。根目录直接存放 `appsettings.json`、本机 `appsettings.Development.json` 和 `api.db`，不再创建 `data/`。可用 `--contentRoot <绝对目录>` 或标准宿主环境变量指定其他根目录。数据库和 FFmpeg 的相对路径都以该根目录为基准，不受进程工作目录影响。

配置按下列顺序覆盖，修改后重启生效：

1. `appsettings.json`：可提交、可发布的普通配置，密钥字段留空。
2. `appsettings.{Environment}.json`：可选环境配置；开发环境使用 `appsettings.Development.json`，保存本机配置和开发密钥，不提交、不复制到构建输出或发布包。
3. 环境变量，分区用 `__` 表示。
4. 命令行参数。

按标准环境名加载配置，不额外加载 User Secrets。生产不加载 `appsettings.Development.json`，密钥通过环境变量提供。首次运行不会自动生成或覆盖密钥；缺少公共管理密钥时启动校验失败，只提示配置项名称。新版按全新安装初始化，不导入旧版配置、授权码或登录状态；首次部署重新登录小米账号。

| 配置项 | 默认值 / 含义 |
| --- | --- |
| `ConnectionStrings:DefaultConnection` | `Data Source=api.db`；支持配置 SQLite 文件路径，统一连接工厂解析为绝对路径 |
| `Security:BootstrapToken` | 公共管理密钥，至少 32 字符；用于生成、轮换应用授权码，以及模块初始化与重绑 |
| `Cors:AllowedOrigins` | 精确 Origin 数组；默认空，按部署需要配置，不从其他环境继承本机 Origin |
| `Tools:FFmpeg:Path` | 可选 FFmpeg 路径；显式配置无效时不回退 |
| `Modules:XiaomiCamera:Enabled` | 默认 `true`；禁用时不初始化摄像头服务、创建摄像头表或检查 FFmpeg |
| `Modules:XiaomiCamera:MaxConcurrentStreams` | 默认 `2`，包括回收中的设备媒体流；同一设备共享容量 |
| `Modules:XiaomiCamera:Media:Profile` | 默认 `server`，也可选择 `development` |

新安装可手动创建本机 `appsettings.Development.json`。下面均为占位符，须替换成独立生成的随机值；也可先禁用摄像头，仅使用公共功能：

```json
{
  "Security": { "BootstrapToken": "YOUR_RANDOM_MANAGEMENT_TOKEN_AT_LEAST_32_CHARACTERS" },
  "Cors": { "AllowedOrigins": ["http://127.0.0.1:4001", "http://localhost:4001"] },
  "Modules": { "XiaomiCamera": { "Enabled": false } }
}
```

生产示例配置项名：`Security__BootstrapToken`、`ConnectionStrings__DefaultConnection`、`Tools__FFmpeg__Path`。Origin 数组使用 `Cors__AllowedOrigins__0` 等索引。不要通过命令行传递真实密钥，也不要打印配置转储。

## 启动与授权

仓库根目录执行 `./run.sh api`。本地启动配置使用 `Development`；根脚本显式指定项目内容根目录。直接启动可使用：

```bash
dotnet run --project api/src/Meowv.Api -- --contentRoot /YOUR_CHECKOUT/api/src/Meowv.Api
```

根脚本使用 `api` 或简写 `a`，重复参数会去重。仓库不再包含旧项目源码；API 的运行与发布独立于旧目录。根构建脚本仍保留既有旧部署产物，供人工回滚。

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

公共管理接口有限流，超过额度统一返回 `429`，授权码响应及初始化页面禁止缓存。宿主在限流前处理转发头，只信任本机 IPv4 / IPv6 回环代理的一跳 `X-Forwarded-For` 和 `X-Forwarded-Proto`；适用于仓库 Nginx 转发到 `127.0.0.1:5000` 的布局，其他来源的转发头不生效。普通业务通过标准认证 Scheme 校验 Bearer 授权码，缺失或错误返回 `401 access_code_unauthorized`，在业务参数绑定前拦截；管理密钥不代替应用授权码。摄像头管理只保留 `/api/xiaomi-camera/setup/...`，不提供独立初始化页面或旧初始化 API 兼容入口；公共授权码只由 `/api/auth/...` 管理。

## 接口目录

打开 `http://localhost:5000/api/docs`，按模块查看当前注册的接口；可搜索模块名、路径、请求方式和认证要求。目录只展示清单，不提供接口调用或调试功能。需要程序读取时，使用 `GET /api/modules`：每个模块包含 `name`、`description`、`endpoints`，接口包含 `path`、`methods`、`authorization`。

目录沿用原模块清单的匿名访问方式，只返回路由元数据。内容从运行时路由自动收集，包含已注册但暂不可用的模块，不包含已禁用模块；接口是否可用仍以模块健康接口和实际响应为准。认证要求区分匿名、通用授权码、管理密钥及模块自行校验的播放票据。

## 模块与存储约定

- 实现 `IEndpointModule`，在 `ModuleCatalog.Registrations` 显式登记泛型 DI 注册，不使用反射扫描。
- 宿主通过空路径分组为模块路由统一附加 `EndpointModuleMetadata`，目录按该元数据归属接口，不依赖路径前缀推断。模块自行校验的票据接口添加 `EndpointAccessMetadata`，避免被误标为匿名。
- 新端点使用 `/api/<module>/...`；需公共授权的路由或分组调用 `.RequireAuthorization()`。健康和其他公共接口保持匿名；特殊票据由模块单独校验。
- 模块初始化、重绑和其他管理操作统一使用 `ApiAuthorization.ManagementPolicy` 与公共管理密钥，不单独实现模块管理认证。
- 业务入口保持无状态，请求所需服务通过端点参数注入；可选模块不可用拦截发生在依赖绑定前。
- 摄像头配置在模块初始化时校验；无效并发数或开关格式使模块就绪检查及业务接口返回 `503`，公共授权与宿主健康检查继续工作。明确设置 `Enabled: false` 时不注册模块，也不校验其他摄像头配置。
- 共用 `ApiDatabase` 的连接工厂与 `schema_migrations` 版本记录，模块维护自己的表。`xiaomi_camera_state` 直接保存云会话 JSON，不再使用 `DataKey` 或应用层加密，不保存小米账号密码、验证码；不预建通用仓储或事件总线。
- 配置绑定使用源生成，HTTP 与存储 DTO 维护 JSON 源生成元数据；开发也关闭反射式 JSON 序列化。公共授权接口使用 `IAccessCodeService`，媒体票据读取公共授权版本及模块会话版本。

## 发布与验证

新版发布不包含任何旧数据迁移入口，也不读取此前加密保存的云会话。部署时使用新配置和新的数据库路径，重新生成公共授权码并登录小米账号；已有本机数据和旧部署产物不会自动删除。

模块初始化日志标明失败阶段；摄像头就绪接口也会返回受控的错误说明。若提示数据库当前版本 `1`、程序要求版本 `2`，说明仍在使用之前的加密会话结构：先备份数据库，再人工重建摄像头表并重新登录，或配置全新的数据库路径；程序不会自动删除或迁移旧数据。

```bash
./build.sh api                       # 默认 win-x64
./build.sh api --rid linux-x64
cd api
bash scripts/publish.sh --rid osx-arm64
bash scripts/publish.sh --rid linux-x64 --without-ffmpeg
```

主程序保持自包含、完整裁剪和压缩单文件，旁置无密钥的 `appsettings.json`；FFmpeg 位于发布根目录共享的 `tools/ffmpeg/<RID>/`。`appsettings.Development.json`、数据库及其附属文件不进入应用发布或根脚本暂存包。`--without-ffmpeg` 只跳过工具准备，不自动禁用摄像头。

发布环境可将数据库路径指向站点目录之外，升级程序不能覆盖数据库或部署密钥。产物映射及上传约定见[根 README](../README.md)，发布脚本不注册或重启服务。

定向检查：

```bash
bash api/scripts/check-runtime.sh
node --test api/tests/setup-page.test.mjs
```

检查仅用本机包缓存建立临时测试宿主，覆盖配置、模块初始化故障隔离、可信代理与按客户端限流、公共授权、云会话存储及票据。模块隔离检查使用真实注册与初始化代码，登录和媒体依赖使用测试占位类型，不构建完整 API、不调用摄像头。完整构建、真实设备、目标平台发布和生产切换需分别验证，不能用这些定向检查代替。

页面状态测试使用 Node.js 内存 DOM 和合成响应，覆盖首次初始化、已有状态、验证码流程、模块故障、轮换确认及退出清理，不使用真实凭据。
