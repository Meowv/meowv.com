# XiaomiCamera

`XiaomiCamera` 是可部署在 macOS、Windows 与 Linux 的单实例服务：负责小米账号初始化、加密保存已换取的小米云会话、CS2 摄像头发现与 HLS 输出。它不会保存小米账号密码或验证码。

## 启动

首次启动无需设置 XiaomiCamera 专用环境变量：服务会在服务存储目录生成 `data/xiaomi-camera.json`，其中保存数据库路径、数据加密密钥、部署密钥与本地 Studio Origin 白名单。发布版本的存储目录是可执行文件所在目录；源码运行时是 `xiaomiCamera/src/XiaomiCamera/` 目录。配置文件与数据库都属于敏感持久化数据，不得提交 Git、放入静态目录或暴露给非部署账户。

本地开发示例：

```bash
dotnet run --project src/XiaomiCamera --urls http://127.0.0.1:5189
```

首次启动后，到服务存储目录的 `data/xiaomi-camera.json` 读取 `bootstrapToken`，在初始化页输入它。请将整个 `data/` 目录挂载到持久化存储；数据库包含加密会话和授权码的不可逆派生结果，但不包含小米密码、验证码或授权码原文。

配置文件支持停服后手动修改，修改后需重启服务：

```json
{
  "dataPath": "/srv/xiaomi-camera/data/xiaomi-camera.db",
  "dataKey": "Base64 编码的 32 字节密钥",
  "bootstrapToken": "部署管理员密钥",
  "allowedOrigins": ["https://studio.example.com"],
  "ffmpegPath": "/usr/local/bin/ffmpeg"
}
```

- `dataKey` 修改后无法解密已有 SQLite 会话；除非准备重新登录，否则不要修改。
- `bootstrapToken` 可修改，用于轮换部署管理员密钥。
- `allowedOrigins` 只允许不带路径的精确 `http` 或 `https` Origin；公网部署应填入实际 Studio 地址。
- `ffmpegPath` 可选；填写 FFmpeg 可执行文件的绝对路径（也可使用相对配置文件目录的路径）。未填写时使用发布目录共享缓存或系统 PATH。
- Linux/macOS 首次生成后会将配置文件权限收紧为仅当前用户可读写；Windows 使用部署账户的默认 ACL。

### 容器与旧部署覆盖项

环境变量仍可覆盖配置文件，适用于 Docker、systemd、Kubernetes 等 Secret 注入场景：`XIAOMI_CAMERA_CONFIG_PATH`、`XIAOMI_CAMERA_DATA_PATH`、`XIAOMI_CAMERA_DATA_KEY`、`XIAOMI_CAMERA_BOOTSTRAP_TOKEN` 与 `XIAOMI_CAMERA_ALLOWED_ORIGINS`。`XIAOMI_FFMPEG_PATH` 也可临时覆盖 `ffmpegPath`。

若是已有 SQLite 数据库、但尚未生成配置文件的旧部署，必须仅首次通过 `XIAOMI_CAMERA_DATA_KEY` 提供原有数据密钥；服务会将它写入新的配置文件。否则服务会拒绝启动，避免新密钥导致已有会话无法解密。

启动后打开 `http://127.0.0.1:5189/setup/xiaomi`，先输入部署密钥，再完成小米账号登录和可能的二次验证。首次完成初始化会显示一次应用授权码，请立即保存；服务端不会再次显示已有授权码。遗失时，使用部署密钥在初始化页重新生成，旧授权码会立即失效。

## 设备 API

设备目录使用初始化后一次性显示的应用授权码调用：

```http
GET /api/cameras
Authorization: Bearer YOUR_ACCESS_CODE
```

缺少或错误的授权码返回 `401` 与 `access_code_unauthorized`。小米云会话无效或已过期返回 `409` 与 `xiaomi_session_expired`，此时需使用部署密钥重新完成初始化；它不表示应用授权码失效。

## 播放会话

预览前由前端使用长期授权码创建播放会话：

```http
POST /api/playback-sessions
Authorization: Bearer YOUR_ACCESS_CODE
Content-Type: application/json

{ "deviceFingerprint": "YOUR_CAMERA_FINGERPRINT" }
```

服务会验证设备属于当前账号、在线且兼容 CS2，然后返回短期 HLS 清单地址。清单与分片路径只携带随机播放票据，不包含长期授权码；票据绑定单台设备，连续十分钟没有访问会失效。重新生成应用授权码会立即使所有既有播放票据失效。

票据失效的清单或分片请求返回 `410`。分片暂时缺失仍返回 `404`，浏览器会按 HLS 规则刷新清单继续加载；Studio 仅在收到 `410` 时自动重新创建一次播放会话。

公网部署必须经 HTTPS 反向代理提供服务，并将 Studio 实际 Origin 配入 `XIAOMI_CAMERA_ALLOWED_ORIGINS`。Studio 的 HTTPS 页面不会连接非本机 HTTP 服务。

## 媒体

服务启动时会预检 FFmpeg，并按以下顺序查找：

1. `XIAOMI_FFMPEG_PATH` 指向的可执行文件；
2. `xiaomi-camera.json` 的 `ffmpegPath`；
3. 发布根目录内的 `tools/ffmpeg/<RID>/ffmpeg`（Windows 为 `ffmpeg.exe`）；
4. 系统 `PATH` 中的 `ffmpeg`。

因此，使用项目发布脚本制作的 Windows、Linux、macOS 包不要求最终用户额外安装 FFmpeg。开发环境仍可使用系统 FFmpeg 或 `XIAOMI_FFMPEG_PATH` 覆盖。

### 多平台发布

发布脚本会生成自包含 .NET 包。首次为某个 RID 发布时，脚本下载 FFmpeg 到构建根目录的共享缓存，并校验 Release 提供的 SHA-256 清单；之后使用相同 Release 时会校验本地二进制摘要并直接复用，不再发起下载请求。默认使用脚本内固定的不可变 Release `v9.0.2`；需要升级时可以显式指定另一个不可变 tag，不能使用 `latest`：

```bash
scripts/publish.sh --rid osx-arm64
scripts/publish.sh --rid osx-x64
scripts/publish.sh --rid win-x64
scripts/publish.sh --rid win-arm64
scripts/publish.sh --rid linux-x64
scripts/publish.sh --rid linux-arm64
```

例如升级 FFmpeg 时：`scripts/publish.sh --rid win-x64 --ffmpeg-release v9.0.2`。

构建根目录默认为 `build/`：应用产物位于 `build/<RID>/`，共享 FFmpeg 缓存位于 `build/tools/ffmpeg/<RID>/`，不再重复放入每个 RID 目录。运行时须保留这一层级关系。`--output <DIR>` 可更换整个构建根目录。`scripts/fetch-ffmpeg.sh` 默认从 `binmgr/ffmpeg` Release 获取构建，也可通过 `--source-base` 切换至经审核的镜像源。

当前转码使用 `libx264`。发布前应按所选 FFmpeg 构建的许可证要求，随发布包提供相应的许可证、来源说明及必要的合规材料。摄像头视频会在内存与会话临时目录中转为 H.264 HLS，30 秒无访问后自动停止上游会话并清理临时分片。
