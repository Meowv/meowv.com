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
  "ffmpegPath": "/usr/local/bin/ffmpeg",
  "media": {
    "profile": "server"
  }
}
```

- `dataKey` 修改后无法解密已有 SQLite 会话；除非准备重新登录，否则不要修改。
- `bootstrapToken` 可修改，用于轮换部署管理员密钥。
- `allowedOrigins` 只允许不带路径的精确 `http` 或 `https` Origin；公网部署应填入实际 Studio 地址。
- `ffmpegPath` 可选；填写 FFmpeg 可执行文件的绝对路径（也可使用相对配置文件目录的路径）。未填写时使用发布目录共享缓存或系统 PATH。
- `media.profile` 可选且必须显式设置为 `server` 或 `development`；旧配置缺失时按 `server` 读取，不按操作系统或环境自动切换。`server` 上限为 1280×720、15 fps、目标/峰值码率 1/1.5 Mbps、`ultrafast`；`development` 上限为 1920×1080、25 fps、目标/峰值码率 3/5 Mbps、`veryfast`。两档不放大低分辨率源。服务会请求摄像头音频；收到支持的音频帧时转为 AAC 并合入 HLS，未收到音频时沿用视频流。

转码不再强制把输入解释为 25 fps；FFmpeg 从 H.264/H.265 码流识别时序，并只在输入高于档位上限时限帧，不将低帧率源补帧。CS2 包序号与时间戳会按 30 秒窗口记录统计，用于判断上游是否有丢包或时间戳倒退。媒体队列最多缓存 128 个包；如果转码长期跟不上而队列满，服务会中止并重建该播放会话，而不是静默丢弃压缩帧后继续输出损坏画面。
- 服务器部署保持 `server`；本地开发可将此项改为 `development` 并重启服务。服务日志会记录选中的档位、连接各阶段耗时、FFmpeg 识别到的输入画面信息、首帧/首分片耗时、播放列表更新间隔，以及 FFmpeg 编码速度、CPU 和内存。日志不记录账号、密码、验证码、会话字段、部署密钥或授权码。
- 诊断采样正在按阶段补齐：当前输入时间戳仍需后续时间线里程碑修复，因此此阶段不会把源帧率限制宣称为已验证；服务器/开发档位的分辨率、编码预设和码率约束已应用，准确帧率约束会在源时间戳接入后完成。
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

服务会验证设备属于当前账号、在线且兼容 CS2，然后返回短期 HLS 清单地址、准备状态和状态查询地址。新客户端每秒通过短期票据查询 `preparing`、`ready`、`failed` 或 `stopped`；仅进入 `ready` 后才加载 HLS。状态查询不发送长期授权码。服务最多等待 90 秒，并在至少 3 个完整分片、约 6 秒初始缓冲可用后才报告 `ready`，以匹配播放器的直播同步目标；失败时会返回阶段错误。准备期间的状态查询会刷新会话活动时间，停止查询后 30 秒无访问即回收转码资源。旧客户端仍可直接请求清单，服务会在清单端等待首段。

播放状态还返回 `audioAvailable`：只有收到支持的音频帧并启用音视频转码时才为 `true`。Studio 在此时允许用户主动开启声音。服务先以 `enableaudio=1` 请求音频；若 3 秒内仍未收到，会补发一次 MISS `0x104`。首次音频帧的编码、采样率标志和时间戳会写入日志，音频载荷不会写入日志。接入摄像机 4 后仍需实测实际编码、声音、同步和断线恢复。

### 云台单步控制

播放会话进入 `ready` 后，Studio 会为 `chuangmi.camera.079ac1` 显示四方向单步按钮。控制请求使用应用授权码，不能使用 HLS 播放票据：

```http
POST /api/cameras/YOUR_CAMERA_FINGERPRINT/ptz
Authorization: Bearer YOUR_ACCESS_CODE
Content-Type: application/json

{ "direction": "left" }
```

方向仅支持 `left`、`right`、`up`、`down`；同一设备最少间隔 1 秒，当前不支持长按。`status: sent` 只表示加密指令已送入现有 CS2 会话，**不代表摄像头已经移动**。Studio 的 HLS 画面有数秒缓冲，不能用按钮点击到画面变化的时间衡量云台指令耗时。`0x112` 与 `operation=1..4` 的方向映射来自其他型号，摄像机 4 的实际移动效果必须逐方向实测后才能确认。

清单与分片路径只携带随机播放票据，不包含长期授权码；票据绑定单台设备，连续十分钟没有访问会失效。重新生成应用授权码会立即使所有既有播放票据失效。

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

发布脚本会生成自包含 .NET 包。首次为某个 RID 发布时，脚本下载 FFmpeg 到构建根目录的共享缓存，并校验 Release 提供的 SHA-256 清单；之后使用相同 Release 时会校验本地二进制摘要并直接复用，不再发起下载请求。Windows 默认使用脚本内固定的 BtbN GPL 快照，以提供 H.264 转码所需的 `libx264`；macOS/Linux 继续使用固定的 `v9.0.2`。需要升级时可显式指定对应来源的另一个不可变 tag，不能使用 `latest`：

```bash
scripts/publish.sh --rid osx-arm64
scripts/publish.sh --rid osx-x64
scripts/publish.sh --rid win-x64
scripts/publish.sh --rid win-arm64
scripts/publish.sh --rid linux-x64
scripts/publish.sh --rid linux-arm64
```

例如升级 FFmpeg 时，Windows 传 BtbN 的固定 `autobuild-...` tag，macOS/Linux 传 binmgr 的固定版本 tag：

```bash
scripts/publish.sh --rid win-x64 --ffmpeg-release autobuild-2026-10-11-13-04
scripts/publish.sh --rid osx-arm64 --ffmpeg-release v9.0.2
```

构建根目录默认为 `build/`：应用产物位于 `build/<RID>/`，共享 FFmpeg 缓存位于 `build/tools/ffmpeg/<RID>/`，不再重复放入每个 RID 目录。运行时须保留这一层级关系。`--output <DIR>` 可更换整个构建根目录。Windows 默认从 BtbN 的 GPL 构建快照获取 FFmpeg；其他平台默认从 `binmgr/ffmpeg` Release 获取。`SOURCE.txt` 会记录资源、来源、摘要与许可证信息；`--source-base` 只应切换到提供相同文件名和校验清单格式的经审核镜像源。

当前转码使用 `libx264`。Windows 发布包包含 GPL FFmpeg 二进制；发布、再分发或向第三方交付前，必须按 GPL-3.0-or-later、FFmpeg 与 x264 的适用许可证提供完整的许可证、来源说明与其他必要合规材料。服务启动会预检 `libx264`，缺失时拒绝启动，避免播放时才出现不透明的转码失败。摄像头视频会在内存与会话临时目录中转为 H.264 HLS，30 秒无访问后自动停止上游会话并清理临时分片。
