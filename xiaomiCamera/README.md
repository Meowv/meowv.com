# XiaomiCamera

`XiaomiCamera` 是单实例 ASP.NET Core 服务，通过小米云会话和 CS2 中继连接摄像头，将视频转为浏览器可播放的 H.264 HLS，并提供音频播放与摄像机 4 的云台单步控制。服务可运行在 Windows、Linux 和 macOS；部署机器无需与摄像头处于同一局域网。

## 项目结构

| 路径 | 职责 |
| --- | --- |
| `src/XiaomiCamera/` | HTTP API、初始化页、播放会话、HLS 转码与配置 |
| `src/XiaomiCamera.Cloud/` | 小米账号登录、云端请求与设备目录 |
| `src/XiaomiCamera.Protocol/` | CS2 中继、MISS 控制与媒体协议 |
| `src/XiaomiCamera.Core/` | 跨项目契约 |
| `scripts/` | 自包含发布与 FFmpeg 获取脚本 |

项目面向 .NET 10。运行时需要带 `libx264` 编码器的 FFmpeg；发布脚本会为目标平台准备二进制文件。

## 本地启动与初始化

在 `xiaomiCamera/` 目录运行：

```bash
dotnet run --project src/XiaomiCamera --urls http://127.0.0.1:5189
```

首次启动会自动生成 `src/XiaomiCamera/data/xiaomi-camera.json` 和 SQLite 数据库。发布版本默认在可执行文件所在目录的 `data/` 下生成。打开 `http://127.0.0.1:5189/setup/xiaomi`，从配置文件读取 `bootstrapToken`，在页面完成小米账号登录及可能的二次验证。首次初始化显示一次应用授权码；请妥善保存。丢失后可用部署密钥在初始化页轮换，旧授权码和已有播放票据随即失效。

配置文件和数据库属于敏感持久化数据。部署时保留整个 `data/` 目录，不要提交到 Git 或放入静态文件目录。服务不保存小米账号密码、验证码或应用授权码原文；数据库保存加密后的云会话及授权码派生结果。

## 配置

停服后编辑 `data/xiaomi-camera.json`，再重启服务使配置生效。以下值均为占位示例：

```json
{
  "dataPath": "/srv/xiaomi-camera/data/xiaomi-camera.db",
  "dataKey": "BASE64_ENCODED_32_BYTE_KEY",
  "bootstrapToken": "YOUR_BOOTSTRAP_TOKEN",
  "allowedOrigins": ["https://studio.example.com"],
  "ffmpegPath": "/usr/local/bin/ffmpeg",
  "media": { "profile": "server" }
}
```

| 配置项 | 说明 |
| --- | --- |
| `dataPath` | SQLite 文件路径；相对路径以配置文件目录为基准。 |
| `dataKey` | Base64 编码的 32 字节密钥。更换后无法解密已有云会话，需重新登录。 |
| `bootstrapToken` | 保护初始化和授权码轮换接口的部署密钥。 |
| `allowedOrigins` | 可访问 API 的精确 `http`/`https` Origin，不含路径。公网接入时填入 Studio 实际 Origin。 |
| `ffmpegPath` | 可选；FFmpeg 可执行文件路径，相对路径以配置文件目录为基准。 |
| `media.profile` | `server` 或 `development`；缺失时默认 `server`，不会按运行环境自动切换。 |

本地默认允许 `http://127.0.0.1:4001` 和 `http://localhost:4001`。Linux/macOS 会把配置文件权限收紧为当前用户读写；Windows 使用部署账户的文件 ACL。

容器或旧部署可用环境变量覆盖配置：`XIAOMI_CAMERA_CONFIG_PATH`、`XIAOMI_CAMERA_DATA_PATH`、`XIAOMI_CAMERA_DATA_KEY`、`XIAOMI_CAMERA_BOOTSTRAP_TOKEN`、`XIAOMI_CAMERA_ALLOWED_ORIGINS`（逗号分隔）。`XIAOMI_FFMPEG_PATH` 优先于配置文件的 `ffmpegPath`。如果可执行文件位于站点静态目录，启动前应使用 `XIAOMI_CAMERA_CONFIG_PATH` 指向站点目录之外的持久化配置文件；首次生成时数据库默认位于该配置文件的同级目录。已有数据库但尚无配置文件时，首次启动必须通过 `XIAOMI_CAMERA_DATA_KEY` 提供原数据密钥，否则服务拒绝生成新密钥。

## Studio 接入与 API

在 Studio 配置服务地址及初始化时获得的应用授权码。公网访问需用 HTTPS 反向代理提供服务，并把 Studio 的实际 Origin 加入 `allowedOrigins`；HTTPS 页面不能访问非本机的 HTTP 服务。

| 接口 | 凭据 | 用途 |
| --- | --- | --- |
| `GET /api/health` | 无 | 服务健康状态。 |
| `GET /api/cameras` | 应用授权码 | 返回当前账号下兼容 CS2 的摄像头及 `deviceFingerprint`。 |
| `POST /api/playback-sessions` | 应用授权码 | 验证设备归属、在线状态与 CS2 兼容性，创建播放票据。 |
| `GET /api/playback-sessions/{ticket}/status` | 播放票据 | 查询 `preparing`、`ready`、`failed`、`stopped` 及 `audioAvailable`。 |
| `GET /api/playback-sessions/{ticket}/index.m3u8` | 播放票据 | 获取 HLS 清单；分片沿用同一票据。 |
| `POST /api/cameras/{fingerprint}/ptz` | 应用授权码 | 对已进入 `ready` 的摄像机 4 发送一次方向指令。 |

创建播放会话：

```http
POST /api/playback-sessions
Authorization: Bearer YOUR_ACCESS_CODE
Content-Type: application/json

{ "deviceFingerprint": "YOUR_CAMERA_FINGERPRINT" }
```

响应包含 `playlistUrl`、`statusUrl`、`status` 和 `audioAvailable`。客户端可每秒查询状态，进入 `ready` 后再加载 HLS。准备阶段最长等待 90 秒；服务在至少 3 个完整分片、约 6 秒初始缓冲就绪后报告 `ready`。状态查询无需长期授权码。票据绑定本次媒体会话；流失败或停止后，客户端应重新创建播放会话，旧票据不会自动切换到重建后的媒体流。

云台仅接受 `left`、`right`、`up`、`down`，同一设备两次指令至少间隔 1 秒，目前不支持长按：

```http
POST /api/cameras/YOUR_CAMERA_FINGERPRINT/ptz
Authorization: Bearer YOUR_ACCESS_CODE
Content-Type: application/json

{ "direction": "left" }
```

`status: sent` 表示指令已发送，不表示机身已完成移动。Studio 的 HLS 画面有缓冲，画面变化可能晚于机身动作；不能据此衡量指令耗时。当前仅对 `chuangmi.camera.079ac1` 开放此接口。

缺少或错误的应用授权码返回 `401 access_code_unauthorized`；小米云会话失效返回 `409 xiaomi_session_expired`，需要重新初始化。播放票据绑定单台设备，连续 10 分钟未访问会失效；删除登录会话、切换账号或重新登录会撤销已有播放票据并停止旧媒体流；失效票据访问清单或分片返回 `410`，暂时缺失的分片返回 `404`。停止状态查询和媒体请求约 30 秒后，服务回收上游连接、FFmpeg 进程和临时分片。

## 媒体处理

服务请求摄像头音频；收到支持的音频帧后转为 AAC 并合入 HLS，此时状态中的 `audioAvailable` 才会变为 `true`。没有可用音频时仍输出视频。声音播放是摄像头到浏览器的单向监听，不包含麦克风上行。

| 档位 | 最大画幅 | 帧率上限 | 目标/峰值码率 | H.264 预设 |
| --- | --- | --- | --- | --- |
| `server` | 1280×720 | 15 fps | 1000/1500 kbps | `ultrafast` |
| `development` | 1920×1080 | 25 fps | 3000/5000 kbps | `veryfast` |

两档均不会放大低分辨率源，也不会为低帧率源补帧。音频和视频输入队列各最多缓存 512 个包；转码持续跟不上导致队列满时会终止该会话，避免静默丢弃压缩帧。服务日志提供 CS2 包序号和时间戳统计、播放准备与分片耗时、FFmpeg 编码速度及资源指标；排查画面延迟时应结合这些指标和浏览器播放器状态。

服务启动时按 `XIAOMI_FFMPEG_PATH`、配置文件 `ffmpegPath`、发布目录 `tools/ffmpeg/<RID>/`、系统 `PATH` 的顺序查找 FFmpeg，并预检 `libx264`。缺少所需编码器时会在启动阶段报错。

## 发布

从 `xiaomiCamera/` 目录调用发布脚本，例如：

```bash
scripts/publish.sh --rid win-x64
```

支持 `win-x64`、`win-arm64`、`linux-x64`、`linux-arm64`、`osx-x64`、`osx-arm64`。脚本执行自包含单文件 .NET 发布：主程序为 `XiaomiCamera`（Windows 为 `XiaomiCamera.exe`），包含 .NET 运行时、托管依赖、SQLite 等原生库及内嵌调试信息，部署机器无需安装 .NET。原生库会在启动时由 .NET 释放到运行账户的缓存目录。

默认主程序位于 `build/<RID>/`，FFmpeg 仍是独立二进制，由脚本下载、校验或复用，位于同一构建根目录的 `build/tools/ffmpeg/<RID>/`；部署时须保留这层目录关系。配置、SQLite 数据库及媒体文件在运行时生成，不打入主程序。发布到已有目录时可能保留旧版本的 DLL、PDB 或 `web.config`；只需分发新的主程序和 FFmpeg 工具目录。仓库根 `build.sh xiaomiCamera` 只搬运单文件主程序和工具目录，不带入这些残留文件或 `data/`。

可用 `--output <DIR>` 更换构建根目录，用 `--ffmpeg-release <TAG>` 指定不可变 Release tag。下载来源和许可证信息记录在 FFmpeg 缓存目录的 `SOURCE.txt`；具体默认来源、参数及校验规则以 [`scripts/publish.sh`](scripts/publish.sh) 和 [`scripts/fetch-ffmpeg.sh`](scripts/fetch-ffmpeg.sh) 为准。

转码使用 `libx264`，Windows 默认发布包包含 GPL FFmpeg 二进制。再分发或交付发布包前，需核对 FFmpeg、x264 及相应二进制的许可证和来源材料。
