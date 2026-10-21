# Meowv.Api

基于 .NET 10 / ASP.NET Core 的统一后端，提供公共授权、健康检查、接口目录及小米摄像头模块。Studio 通过 API 访问设备目录、实时预览和云台控制。

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

目录与模块清单允许匿名访问，只返回路由元数据。内容从运行时路由自动收集，包含已注册但暂不可用的模块，不包含已禁用模块；接口是否可用仍以模块健康接口和实际响应为准。认证要求区分匿名、通用授权码、管理密钥及模块自行校验的播放票据。

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
