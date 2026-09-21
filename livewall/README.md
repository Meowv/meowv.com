# livewall

macOS 视频动态壁纸工具。**个人自用 / 小范围共享**定位，不面向大规模公开发布。

- 定位、目录结构、快速开始、实测基线与各功能的实现说明 → 本文件
- 修改边界、约定与验证要求（**改代码前必读**）→ [`AGENTS.md`](./AGENTS.md)
- 清单与视频源的生产者 → [`../wallpapers/README.md`](../wallpapers/README.md)
- 仓库级概览与根目录脚本 → [`../README.md`](../README.md)、[`../AGENTS.md`](../AGENTS.md)

## 名称与用途

| 项                      | 说明                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 名称                    | `livewall` —— live wallpaper 的缩写。目录、Swift 模块、脚本一律用此名                                                                                                                                                                              |
| 界面显示名              | 「动态壁纸」—— 菜单栏标题、系统设置与登录项里显示的应用名，来自 `CFBundleName` / `CFBundleDisplayName`。**它与产物文件名是两件事**：磁盘上的包叫 `build/LiveWall.app`，Finder 里仍显示「动态壁纸」。Swift 模块名、可执行文件名、bundle id 也仍是 `LiveWall` / `com.meowv.livewall` |
| 用途                    | 把一段 mp4 放到 macOS 桌面层循环播放，替代静态壁纸                                                                                                                                                                                                 |
| 平台                    | 仅 macOS（本机实测 macOS 27.0 / arm64，见[本机实测基线](#本机实测基线macos-270--arm64--双屏)）                                                                                                                                                     |
| 内容                    | 仅视频壁纸（mp4），不做静态图片、不做网页/WebGL 壁纸                                                                                                                                                                                               |
| 数据源                  | 二选一：**线上**（默认，CDN 上的 https 直链 + JSON 清单）或**本地文件夹**（只播该文件夹里的 mp4，见[壁纸来源](#壁纸来源线上--本地文件夹)）。两种情况都不建视频库 |
| 与 `wallpapers/` 的区别 | `wallpapers/` 是 Python 采集器（抓元数据进 SQLite）；`livewall` 是客户端播放器。两者无代码依赖                                                                                                                                                     |

**刻意不做的事**（定位决定的）：用户系统、后端服务、多租户、权限体系、运营审核、埋点统计。唯一需要的"服务端"是一个静态 JSON 清单 + 一堆 mp4 文件。

## 当前状态

这个 App 可以日常使用：清单拉取 + 选片（随机 / 顺序，都是一轮内不重复）+ 可调切换间隔（默认 5 分钟 ±20% 抖动）+ HEAD 探测与四路失败处理，一套**信号 → 状态**的省电状态机（遮挡 / 锁屏 / 息屏 / 热压力 / 空闲 / 低电量 / 电池 + 手动暂停），三个免授权的全局热键，开机自启开关，多屏策略（全部同片 / 仅主屏 / 每屏独立，每屏独立时各屏**恢复上次播放的条目**），按一级分类的内容过滤（只拉当前分类的切片，记忆上次选择），**锁屏预览**（把当前这张的静态图同步成系统墙纸，锁屏可见，见[锁屏预览](#锁屏预览)），以及**下载当前壁纸**（视频 + 静态预览图 → `~/Downloads/livewall/`，见[下载当前壁纸](#下载当前壁纸)）。维护段还有**打开动态壁纸** —— 本项目第一个普通 UI 窗口，两栏（分类 / 条目网格），可在里面按分类翻看、**双击打开视频预览浮层**、一键设为桌面壁纸（见[动态壁纸浏览窗口](#动态壁纸浏览窗口)）。配套的**固定**状态（只播这一条、所有屏都不再轮换）也进了「选片顺序」子菜单，见[固定：只播当前这一条](#固定只播当前这一条)。**壁纸来源**可在**线上清单**与**本地文件夹**之间二选一（默认线上），本地模式只播所选文件夹（含子文件夹）里的 mp4，见[壁纸来源](#壁纸来源线上--本地文件夹)。状态项**常驻**（不可移除，菜单底部提供「退出动态壁纸」），状态区常驻显示**进程自身的 CPU / 内存**（只在展开菜单时采样一次，见[进程自身占用](#进程自身占用cpu--内存)）。菜单里能实时改的东西都不需要重启。

**已知未做 / 待人工验收**：热键组合固定，不可配置；「锁屏界面确实显示这张静态图」需要人眼锁一次屏确认；`kill -9` 强杀时墙纸恢复不了，原图路径在日志里；下载目录不可配置。多屏三档策略均已实现，「每屏独立」走多播放槽位，见[多屏策略](#多屏策略)。**浏览窗口的全部交互都只经探针验证过，没有人工点过**（[`AGENTS.md`](./AGENTS.md) 的既有结论：这个 VC 的正确性只能人工验），离线时只能浏览当前播放分类，见[动态壁纸浏览窗口](#动态壁纸浏览窗口)。

## 目录结构

```
livewall/
├─ Package.swift                SwiftPM 清单，三个 target（见下）
├─ README.md                    本文件：项目定位、结构、快速开始
├─ AGENTS.md                    修改边界、约定与验证要求（改代码前必读）
├─ build.sh                     编译并组装 .app（默认 release = 发布版）
├─ make-dmg.sh                  把 .app 打成可分发的 DMG（build/LiveWall-<版本>.dmg）
├─ test.sh                      运行 LiveWallCore 单元测试
├─ run.sh                       以 debug 配置编译并启动（开发；--release 走发布版）
├─ tools/encode-strings.py      生成 PackedText 用的混淆字节数组（改服务端地址时用）
├─ tools/sign-version.swift     version.json 的 Ed25519 签名 / 验签（发版时由 make-dmg.sh 调用）
├─ Resources/
│  ├─ Info-LiveWall.plist   App 的 Info.plist（bundle id com.meowv.livewall）
│  ├─ AppIcon.icns              App 图标（Finder 用，已定稿产物）
│  └─ MenuBarIcon*.png          菜单栏状态项图标（播放态 / 暂停态，各 1x/2x/3x）
├─ Sources/
│  ├─ LiveWallCore/     纯逻辑库，不依赖 NSApplication，可脱离 GUI 单测
│  │  ├─ LevelPreset.swift      层级预设与有效区间（值全部由 CGWindowLevelForKey 派生）
│  │  ├─ TextLayout.swift       终端显示宽度对齐（中文占两列）
│  │  ├─ CatalogModel.swift     索引与切片的 Codable 结构 + 解析/清洗 + 切片地址安全解析
│  │  ├─ CatalogService.swift   索引与切片**各自**的降级链（远程 → 本地副本）
│  │  ├─ SynchronousFetch.swift 同步取数（锁保护结果 + 超时必取消 + 会话可注入，供上面两者共用）
│  │  ├─ CategoryMenu.swift     内容过滤子菜单的行（名字/置灰/勾选），纯逻辑可单测
│  │  ├─ WallpaperSourceMenu.swift 「壁纸来源」子菜单的行（线上 / 本地），纯逻辑可单测
│  │  ├─ LocalVideoSource.swift 本地文件夹 → 条目（递归收 mp4、路径稳定哈希 id）
│  │  ├─ CandidatePool.swift    候选队列，一轮内不重复 + 失效黑名单；选片顺序（随机 / 顺序）；按 id 指定取回
│  │  ├─ PlaybackOrderMenu.swift 「选片顺序」子菜单的行（随机 / 顺序 / 固定），纯逻辑可单测
│  │  ├─ PinnedPlayback.swift   「固定为桌面壁纸」状态机：驱动事件 → 裁决（穷举，漏一处就编译不过）
│  │  ├─ SchedulePolicy.swift   切换间隔与抖动；SwitchInterval 提供预设、合法区间与夹紧
│  │  ├─ DurationText.swift     时长文案（秒 / 分钟 / 小时），空闲阈值与切换间隔共用
│  │  ├─ LogRotation.swift      日志轮转阈值与判定（清空复用同一文件，不留历史文件）
│  │  ├─ FailurePolicy.swift    失败分类与处理决策（拉黑 / 重试 / 保持画面 / 停止）
│  │  ├─ VideoLoadError.swift   加载失败原因（含 HTTP 状态码）
│  │  ├─ PlaybackState.swift    省电信号、状态与判定纯函数 + 空闲阈值文案
│  │  ├─ CoverageGrid.swift     遮挡覆盖率（坐标压缩法，精确面积）
│  │  ├─ MultiScreenPolicy.swift 多屏策略、目标屏选择与槽位分组
│  │  ├─ ScreenSourceStore.swift 每屏独立的源记录（displayID → 条目 id）
│  │  ├─ ScreenSourceRestore.swift 每屏源的恢复计划（过滤掉不在当前分类切片里的记录）
│  │  ├─ LockScreenPreviewPolicy.swift 锁屏预览纯逻辑：写入签名与节流、缓存文件名槽位、目标屏、来源决策
│  │  ├─ DownloadNaming.swift   手动下载的文件名规则（清洗 / 截断 / 扩展名推导）
│  │  ├─ ThumbnailURL.swift     由 coverUrl 拼缩略图地址（OSS 处理参数 + 「处理版 → 原图」候选链）
│  │  ├─ ThumbnailRequestTracker.swift 缩略图请求的去重、限并发与失败记录（失败不自动重试）
│  │  ├─ AboutMenu.swift        「关于」子菜单的内容：作者、博客、赞助渠道（文案只在这里维护一份）
│  │  ├─ ProcessUsage.swift     进程自身 CPU / 内存的采样值、占用率与菜单文案（纯逻辑）
│  │  ├─ Preferences.swift      配置模型与读写（逐字段容错解码）
│  │  ├─ LiveWallPaths.swift    配置 / 缓存 / 日志 / 单实例锁的路径唯一来源
│  │  ├─ AppLog.swift           日志的时间戳格式与「追加一行」（启动早期也要用）
│  │  ├─ SingleInstance.swift   单实例：身份判定、flock 取锁、被挡掉时的回执
│  │  ├─ PackedText.swift       混淆字符串的运行时还原（类型名刻意叫 Folded，见「反编译门槛」）
│  │  ├─ IntegrityCheck.swift   自身代码签名自校验（类型名刻意叫 Seal，只报告不阻断）
│  │  ├─ UpdateState.swift      更新功能在菜单里的**唯一状态**（显隐 / 可点性 / 文案全由它派生）
│  │  ├─ UpdateDecision.swift   版本判定（三态，可穷举）+ 最低系统版本比较
│  │  ├─ UpdateFeed.swift       version.json 的解析与清洗（sha256 必填；落盘文件名走 DownloadNaming）
│  │  ├─ UpdateMenu.swift       「有新版本」那一段的文案与动作（纯数据，可单测）
│  │  ├─ UpdateSignature.swift  version.json 的 Ed25519 验签（公钥内嵌客户端，私钥本机离线）
│  │  └─ SeededGenerator.swift  可复现随机源（供测试确定性验证）
│  ├─ LiveWallDesktop/  依赖 AppKit 的桌面层代码
│  │  ├─ DesktopOverlayWindow.swift  桌面层覆盖窗口
│  │  └─ WindowInspector.swift      层级快照、壁纸/图标层识别、遮挡检测
│  └─ LiveWall/         正式 App
│     ├─ main.swift             入口（菜单栏常驻）
│     ├─ AppDelegate.swift      编排：清单、调度、失败处理、菜单栏、系统事件
│     ├─ ScreenCoordinator.swift 多屏窗口管理 + 层级自检与降级 + bounds 稳定等待
│     ├─ PlaybackGovernor.swift 省电信号采集（通知 + 2 秒轮询）并驱动状态机
│     ├─ HotKeyManager.swift    全局热键（Carbon，零权限）+ 占用检测
│     ├─ LaunchAtLogin.swift    开机自启（SMAppService）
│     ├─ PlaybackEngine.swift   多槽位 AVQueuePlayer + AVPlayerLooper，并提供「取当前帧」
│     ├─ WallpaperBrowserWindowController.swift 浏览窗口的持有者（单窗口复用、.accessory 下激活）
│     ├─ WallpaperBrowserViewController.swift 浏览窗口内容：分类栏 + 条目网格 + 双击预览浮层
│     ├─ BrowserItemView.swift  网格里的卡片（缩略图 + 一行信息 + 「当前」徽标）
│     ├─ ThumbnailLoader.swift  缩略图加载：候选链 + 限并发 + NSCache 内存缓存
│     ├─ PreviewPlayer.swift    浏览窗口的预览播放器（双击打开即播，不可暂停/停止）
│     ├─ LockScreenPreviewer.swift 锁屏预览：静态图下载 → 抓帧兜底 → 设系统墙纸 + 退出固化当前这张
│     ├─ WallpaperDownloader.swift 手动下载当前壁纸（视频 + 静态预览图）
│     ├─ FileDownloader.swift   通用下载到指定路径（锁屏预览与手动下载共用）
│     ├─ VideoLoader.swift      HEAD 探测 + AVAsset 准入校验与时长探测
│     ├─ NetworkMonitor.swift   NWPathMonitor 网络可达性
│     ├─ ProcessMonitor.swift   进程自身的 CPU / 内存采样（惰性：展开菜单时采一次）
│     ├─ UpdateChecker.swift    版本检查（**先验签再解析**；无定时器、失败静默）
│     └─ UpdateInstaller.swift  下载 dmg 并校验（只下载不安装；分块算 sha256）
├─ Tests/LiveWallCoreTests/     单元测试 + 自建断言运行器（本机无 XCTest，见下）
└─ build/                       组装产物（.gitignore）
```

### 为什么测试不用 XCTest

本机只装了 Xcode Command Line Tools，**没有完整 Xcode**，因此 `XCTest` 与 `Swift Testing` 都不可用：

```
error: unable to resolve module dependency: 'XCTest'
```

替代方案是用 `executableTarget` + 自建断言运行器（`Tests/LiveWallCoreTests/Harness.swift`），
`./test.sh` 执行，失败时返回非零退出码。功能上够用，代价是没有 IDE 集成与测试筛选。
**不要把它改成 `testTarget`**，那会直接编译失败。

## 图标

两处图标互相独立，用途与生成方式都不同。

|          | App 图标                           | 菜单栏状态项图标                      |
| -------- | ---------------------------------- | ------------------------------------- |
| 文件     | `Resources/AppIcon.icns`           | `Resources/MenuBarIcon*.png`          |
| 可见位置 | Finder / 访达信息面板              | 菜单栏（日常唯一可见处）              |
| 声明方式 | `Info.plist` 的 `CFBundleIconFile` | 无声明，代码按文件名加载              |
| 分辨率   | icns 内含 10 档（16→1024）         | 18pt 逻辑尺寸，1x/2x/3x 三档          |
| 状态区分 | 无                                 | 播放态四色风车 / 暂停态同形状统一中灰 |

两者都由 `build.sh` 拷进 `Contents/Resources/`，并在 ad-hoc 签名时封存（`codesign -dv` 的
`Sealed Resources files=` 计数应等于拷贝的文件数）。**图标缺失不会中断构建**，
脚本只打印警告 —— 本地开发时不想带图标是允许的。

### 落位与分辨率

- **App 图标**：`CFBundleIconFile` 的值是 `AppIcon`，**不带扩展名**。icns 内部必须包含全部档位；
  macOS 不会从单张位图自动缩放，缺档位时该尺寸会走系统兜底。
- **菜单栏图标**：`AppDelegate.menuBarIcon(named:)` 从 bundle 按名加载，`@2x`/`@3x`
  与主文件同名即可被识别为同一张图的三档位图。代码显式把逻辑尺寸钉在 18pt，
  **不依赖 PNG 里的 DPI 元数据** —— 这样即使只加载到 @2x 位图，显示尺寸也不会翻倍，
  而 Retina 屏仍能采样到全部像素。
- 菜单栏图标**不是模板图**（`isTemplate = false`）。模板图会被系统压成单色剪影并自动反色，
  风车的四种颜色会全部丢失 —— 而「带色彩」正是这个图形的全部意义。代价是无法随菜单栏明暗
  自动反色，因此播放 / 暂停靠**颜色**区分，而不是靠透明度：菜单栏背景是叠在桌面壁纸上的
  半透明层，低 alpha 会让图标和背景混成一团，实测几乎看不见。暂停态沿用同一形状，
  只把四片改填统一中灰（明度 112）—— 该值在浅色栏（背景约 242）与深色栏（约 30）
  上同时有足够对比，是唯一的约束条件，也是它不能更浅或更深的原因。

### 菜单栏风车图的生成

图形由 `Resources/` 下的 PNG 直接决定，没有中间格式。造型与配色都写在下面的脚本里，
改完重跑即可。几何在设计空间 240×240 里定义，中心 `(120, 120)`：

- **四条臂**：圆头粗笔画，厚 20，圆头圆心距中心 90（尖端落在 19.5 / 219.5）。
- **每片刀刃**：由内外两条三次贝塞尔围成的闭合形状 —— 外边界从臂端弧出去，落到相邻横杠的上沿；
  内边界回卷。**曲率是连续变化的，不是圆弧**：外边界上曲率半径从臂端的 ~61 连续变到中段的 ~9
  再回到 ~27。用一段圆弧去拟合，臂端和刀刃根部各会差出几个像素。
- **整个图形 = 「上臂 + 右上刀刃」这个单元绕中心旋转 0/90/180/270 的并集**。四份恰好铺满、
  互不重叠，所以能一色一份：上臂那一片 `#ff5d73`，顺时针依次 `#ffb224`、`#20b875`、`#4388f7`。
- 中心那个 20×20 的方块由四条臂共同覆盖，**每条臂只保留其中逆时针一侧的 10×10 象限**，
  中心才呈风车式咬合；否则四色会按绘制顺序互相压盖，看起来像错位。

暂停态是同形状、四片统一填中灰（明度 112）。

```bash
cd livewall
/usr/bin/python3 - <<'PY'
import numpy as np
from PIL import Image, ImageDraw

COLORS = [(0xFF, 0x5D, 0x73), (0xFF, 0xB2, 0x24), (0x20, 0xB8, 0x75), (0x43, 0x88, 0xF7)]
PAUSED = (112, 112, 116)                          # 浅色栏 / 深色栏都能看清的中间明度
CX, ARM_R, ARM_TIP, SS = 120.0, 10.0, 30.0, 8     # 中心、臂半厚、臂端圆头圆心距、超采样倍数
OUTER = [(123.5, 20.5), (177.05, 26.02), (193.47, 76.83), (166.0, 110.0)]
INNER = [(132.74, 41.32), (167.14, 51.82), (173.48, 96.18), (130.57, 109.54)]

def bezier(ctrl, n=240):
    c = np.asarray(ctrl, float)
    t = np.linspace(0, 1, n)[:, None]
    return ((1 - t) ** 3 * c[0] + 3 * (1 - t) ** 2 * t * c[1]
            + 3 * (1 - t) * t ** 2 * c[2] + t ** 3 * c[3])

def unit0(px):
    """上臂 + 右上刀刃。臂的里端切掉中心方块的右下象限，让给顺时针的下一片。"""
    n = px * SS
    step = 240.0 / n
    yy, xx = np.mgrid[0:n, 0:n].astype(float) * step + step / 2
    d = np.hypot(xx - CX, np.maximum(np.abs(yy - CX) - (CX - ARM_TIP), 0))
    arm = (d <= ARM_R) & (yy <= CX) & ~((xx >= CX) & (yy >= CX - ARM_R))
    poly = [(p[0] / step - .5, p[1] / step - .5)
            for p in np.vstack([bezier(OUTER), bezier(INNER)[::-1]])]
    layer = Image.new('L', (n, n), 0)
    ImageDraw.Draw(layer).polygon(poly, fill=255)
    cover = np.maximum(arm.astype(float), np.asarray(layer, float) / 255)
    return cover.reshape(px, SS, px, SS).mean(axis=(1, 3))

def windmill(px, colors):
    u = unit0(px)
    out = np.zeros((px, px, 4), np.uint8)
    for k in range(4):
        a = np.clip(np.rot90(u, -k) * 255, 0, 255).astype(np.uint8)
        for ch in range(3):
            out[..., ch] = np.where(a > out[..., 3], colors[k][ch], out[..., ch])
        out[..., 3] = np.maximum(out[..., 3], a)
    return Image.fromarray(out, 'RGBA')

for scale in (1, 2, 3):
    sfx = '' if scale == 1 else f'@{scale}x'
    dpi = (72 * scale, 72 * scale)
    windmill(18 * scale, COLORS).save(f'Resources/MenuBarIcon{sfx}.png', dpi=dpi)
    windmill(18 * scale, [PAUSED] * 4).save(f'Resources/MenuBarIconPaused{sfx}.png', dpi=dpi)
PY

./build.sh   # 重新组装 .app
```

这里写 DPI 只是为了文件元数据自洽；`AppDelegate` 会把逻辑尺寸显式钉在 18pt，不读这个值。

### 替换方法

App 图标**已定稿**，`Resources/AppIcon.icns` 就是成品。生成它的源图属于外部设计资产，
**不随仓库分发**（仓库里只有 icns）。想换成自己的图案时，自备一张**正方形 PNG**（尺寸不限，
原源图是 1080×1080；下面会统一重采样到 1024），再走两步生成 icns：

```bash
cd livewall
SRC=/path/to/your-icon.png     # 换成你自己的源图路径

# 1) 源图直接铺满 1024 画布。圆角与底板由系统绘制，自己加会让图标出现双层边框
#    （macOS 会为 App 图标统一加圆角玻璃底板，系统 App 也是这个样式）
/usr/bin/python3 -c "
from PIL import Image
Image.open('${SRC}').convert('RGB').resize((1024,1024), Image.LANCZOS).save('/tmp/m1024.png')"

# 2) 生成 iconset（10 档）并打包 icns
mkdir -p /tmp/AppIcon.iconset
/usr/bin/python3 -c "
from PIL import Image
m = Image.open('/tmp/m1024.png')
for px, n in [(16,'16x16'),(32,'16x16@2x'),(32,'32x32'),(64,'32x32@2x'),(128,'128x128'),
              (256,'128x128@2x'),(256,'256x256'),(512,'256x256@2x'),(512,'512x512'),(1024,'512x512@2x')]:
    m.resize((px,px), Image.LANCZOS).save(f'/tmp/AppIcon.iconset/icon_{n}.png')"
iconutil -c icns /tmp/AppIcon.iconset -o Resources/AppIcon.icns

./build.sh   # 重新组装 .app
```

菜单栏图标的替换见上一节；若只想手绘，直接改 `Resources/MenuBarIcon*.png` 即可，保持
18/36/54 三档像素尺寸与 `MenuBarIcon`、`MenuBarIconPaused` 的命名约定。

### 验证

```bash
cd livewall
./build.sh
ls build/LiveWall.app/Contents/Resources/          # 7 个文件：1 个 icns + 6 个 png
codesign -dv build/LiveWall.app 2>&1 | grep Sealed   # files=7
```

改完图标后 Finder 可能仍显示旧图标（图标缓存）。`touch` 一下该 `.app` 或重启 Finder 即可刷新。

## 快速开始

```bash
cd livewall

# ── 正式 App ─────────────────────────────────────────
# 清单由 App 自己从 https://studio.meowv.com/data/livewall/ 下按需拉取
# （catalog.json 索引 + 当前分类的 category.<id>.json 切片），
# 不需要本地准备任何清单文件。
# 该文件由 wallpapers 的 export-livewall 生成，随 Studio 一起部署：
#   仓库根目录 ./build.sh wallpapers（或 ./build.sh studio --with-wallpapers）
#   单独导出：cd ../wallpapers && PYTHONPATH=src python3 -m wallpapers export-livewall

# 编译并启动（会接管桌面壁纸层）
./run.sh

# 版本差异：默认 debug 构建，含开发者工具（菜单里的「打印窗口层级表」）；
# 该菜单项由 `#if DEBUG` 隔离，release 构建里不编译、二进制中也没有。
./run.sh --release        # 以 release 构建运行，等同发布版行为
./build.sh                # 只打包，产物 build/LiveWall.app（release）
./make-dmg.sh             # 再打成可分发的 DMG：build/LiveWall-<版本>.dmg

# 退出：菜单栏图标 → 退出动态壁纸，或 pkill -x LiveWall（按可执行文件名匹配，
#       若用 --allow-multiple 跑了多个副本，它会一次全杀掉，见「单实例」）。
#         两者都走与系统终止同一条清理路径（含把当前这张的静态图留在桌面上）。
#         用 kill -9（SIGKILL）强杀时清理不了，桌面会停在上一张静态图。
# 日志：~/Library/Logs/com.meowv.livewall/livewall.log（达 2 MB 自动清空复用，不生成历史文件）
#      ⚠️ 日志里含本机绝对路径（包路径、本地壁纸文件夹、用户原墙纸路径）—— 贴出来求助前先看一眼

# ── 测试 ────────────────────────────────────────────
./test.sh
```

配置放在 `~/Library/Application Support/com.meowv.livewall/`：

| 文件                              | 说明                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `config.json`                     | 配置。不存在时用默认值；坏了也不影响启动（回退默认）                                                                              |
| `catalog.remote-cache.index.json` | 索引副本，断网时兜底                                                                                                              |
| `catalog.remote-cache.slice.json` | **一份**分类切片副本，断网时兜底                                                                                                  |
| `cover-0.jpg` / `cover-1.jpg`     | 锁屏预览用的静态图缓存。**两个槽位交替**（同一路径重复设置系统墙纸不触发刷新），扩展名跟随来源（静态图实测有 `.jpg` 也有 `.png`） |

启动时会清掉两个废弃的缓存：`catalog.remote-cache.json`（最早的 `livewall.json` 时代）与
`catalog.remote-cache.catalog.json`（上一版的 4.9 MB 总文件），日志里各记一行。

`config.json` 的字段（全部可省略；**缺字段用默认值，不会因为少一个键而整体解码失败**）：

```json
{
  "remoteCatalogURL": "https://studio.meowv.com/data/livewall/catalog.json",
  "localFolderPath": null,
  "intervalSeconds": 300,
  "jitterRatio": 0.2,
  "switchWhenFinished": false,
  "playbackOrder": "shuffle",
  "gravity": "fill",
  "levelPreset": "desktopWindow",
  "multiScreenPolicy": "mirror",
  "perScreenSources": { "sources": {} },
  "selectedCategoryID": 4001,
  "pinnedItem": null,
  "pauseWhenCovered": true,
  "pauseWhenIdle": true,
  "idleThresholdSeconds": 300,
  "pauseOnLowPowerMode": true,
  "pauseOnBattery": false,
  "pauseOnThermalPressure": true,
  "lockScreenPreview": true
}
```

`remoteCatalogURL` 是**线上清单**的数据源，默认就是线上地址；改成别的 https 地址即可换源，
清空则只剩远程副本与内置兜底条目。旧配置里的 `catalogPath` 会被忽略（本地清单这一层已移除）。
`localFolderPath` 是**本地文件夹**来源的落点：`null` = 用线上清单；填了绝对路径即启用本地来源
（**非 nil 即启用**，不另存布尔量），见[壁纸来源](#壁纸来源线上--本地文件夹)。
`intervalSeconds` 是切换间隔（单位秒，默认 300 = 5 分钟），`jitterRatio` 是抖动比例；
`switchWhenFinished` 与 `playbackOrder` 见[选片顺序与切换间隔](#选片顺序与切换间隔)。
`multiScreenPolicy` 见[多屏策略](#多屏策略)，`selectedCategoryID` 见[内容过滤](#内容过滤)。
`pinnedItem` 是「固定」的落点，见[固定：只播当前这一条](#固定只播当前这一条)：`null` = 正常轮换；
设为桌面壁纸后写进的是**整条条目**（与清单切片里的条目同形），**不是 id** —— 只存 id 就得靠当前
分类切片去定位它，而切分类不解钉，重启时 `selectedCategoryID` 已经换成别的分类就找不到了。
末尾六项是省电开关，语义见[省电策略](#省电策略)；`lockScreenPreview` 见[锁屏预览](#锁屏预览)。

运行时菜单栏会出现 `◉`/`◐`，可在其中下一张、暂停、**切换选片顺序（随机 / 顺序 / 固定）与自动切换间隔**、切换窗口层级与多屏策略、**逐项开关省电策略**、**按分类过滤内容**、**切换壁纸来源（线上 / 本地文件夹）**、**开关开机自启**、**打开动态壁纸浏览窗口**、重新加载内容（本地来源下这一项标题会变成「重新扫描本地文件夹」）。开发构建（debug）额外多一项**打印窗口层级表**（把当前窗口层级快照打到终端，仅排障用，见[快速开始](#快速开始)）。

## 单实例（同一个程序只跑一个）

**同一个程序同时跑两个是禁止的**，由 `LiveWallCore/SingleInstance` 在启动最早期拦掉。

### 为什么会出现两个

`run.sh` 用的是 `exec build/LiveWall.app/Contents/MacOS/LiveWall` —— **直接执行可执行文件**，
绕过了 LaunchServices 的「同 bundle id 复用已有实例」（那条只对 Finder 双击 / `open -a` 生效）。
于是「登录项拉起的打包版」与「手动 `./run.sh` 起的开发版」能同时活着，而两者身份**完全相同**
（bundle id 都是 `com.meowv.livewall`，可执行文件都叫 `LiveWall`）。代码里原先**没有任何单实例判断**。

### 同时跑两个会出什么事

| 危害 | 具体机制 |
| --- | --- |
| **配置互相覆盖**（最隐蔽） | `Application Support/com.meowv.livewall/config.json` 只有一份，两个进程各持一份内存副本，保存是**全量覆盖** → 切换间隔 / 内容过滤 / `pinnedItem` / `perScreenSources` / `localFolderPath` 会被另一个实例的旧值盖回去 |
| **分类缓存语义被破坏** | `catalog.remote-cache.slice.json` **只有一份**，而它的语义是「配置里 `selectedCategoryID` 对应的那一片」。另一个实例切了分类就会改写它 → 离线启动读到错的那一片，只能显示「加载失败」 |
| **日志互相抹掉** | 同一个日志文件，`logLock` 是**进程内**的；轮转是**截断为 0 字节** → 一个实例到阈值就把另一个的排障现场清掉 |
| **同层窗口互相遮挡** | 两边都在 `desktopWindow` 层铺满屏，同层前后顺序由 WindowServer 决定。层级自检里的「同层竞争 ⚠」会把**自家另一个实例**算进去（`WindowInspector` 只排除自己的 pid）。注意 `ScreenCoordinator.calibrate` **刻意不因同层竞争降级**，所以不会误降层级，但「现在看到的是哪个实例的画面」不可控 |
| **全局热键被一方独占** | Carbon `RegisterEventHotKey` 进程独占，后启动的注册失败 → 菜单出现「⚠ 热键冲突」，且 `⌥⌘P/⌥⌘N/⌥⌘R` **只对先注册的那个生效**（按了没反应） |
| **系统墙纸互相覆盖** | 两边都在 `setDesktopImageURL`（锁屏预览），锁屏图会在两张之间抖；退出时 `freezeCurrentWallpaper` 又把它固化成自己那张，而另一个还在播 |
| **资源翻倍** | 同一条视频两个进程各建 `AVURLAsset`、各拉一遍、各解一遍 |
| **退出会连坐** | `pkill -x LiveWall` 按**可执行文件名**匹配 → 一次杀两个，两边同时走 `shutdown()`（都写墙纸、都写配置） |

### 判据与实现

- **身份**：`bundle id` 优先（dev 版与打包版同 id，本来就该互斥）；裸跑 `.build/debug/LiveWall`
  （没有 bundle）时退回可执行文件名 `exe-LiveWall`。锁文件按身份命名：`instance-<身份>.lock`。
- **判据是 `flock(LOCK_EX | LOCK_NB)`**，不是 PID 文件：锁由**内核**持有，进程一退出
  （包括 `kill -9`）自动释放 —— 没有 stale 问题，也就不需要「PID 复用」那套校验。
  `NSRunningApplication` 只在**提示**时用来解释占用者，不作判据（同时启动时两边可能都还没看到对方）。
- **位置**：`main.swift` 里、`NSApplication` **之前**。建覆盖窗口、注册热键、写配置都有副作用，
  等启动完再退出就已经晚了。拿不到锁 → 写回执（stdout + 日志 + 通知老实例）后 `exit(0)`，
  **不碰桌面、不改配置、不注册热键**。
- **锁不可用时照常启动**（目录权限、只读盘…）：记一行日志「本次不设防」。
  锁只是防误操作，不该让 App 起不来。
- **老实例的回执**：新实例发 `DistributedNotificationCenter` 通知，老实例在状态区显示
  「已阻止重复启动（新实例已退出）」—— 否则「第二次点了没反应」会被当成 App 坏了。
- **日志里带 pid 与包路径**（`启动实例 pid=… 路径=…`）：曾同时跑过两个实例，排障时必须能分辨哪条属于哪个副本。

### 开发豁免

`./run.sh --allow-multiple`（内部设 `LIVEWALL_ALLOW_MULTIPLE=1`）显式允许重复启动 ——
对比 debug / release 行为时要用。只认明确真值（`1` / `true` / `yes` / `on`），
写错成别的值**不豁免**（「设了但写错」不该意外打开多实例）。

### 验证（进程级，单测覆盖不到）

单测覆盖「机制」：同进程两个 fd 的锁冲突、放锁后可重取、父目录不存在时自动创建、错误分类。
**真实双进程**另用探针验（已实测，2026-09-21）：A 持锁 6 秒 → B 启动立刻被挡（退出码 3，并报出
`pid 3772（/private/tmp/…）`）→ A 正常退出后 C 能拿到锁 → D 被 `kill -9` 之后 E 也能拿到锁
（这条正是 `flock` 优于 PID 文件的地方）。

## 打包与分发（DMG）

`./make-dmg.sh` 把 `build/LiveWall.app` 打成 DMG：

```bash
./make-dmg.sh              # 先跑 build.sh（release），再打包
./make-dmg.sh --no-build   # 直接打包现有的 build/LiveWall.app
```

产物是 `build/LiveWall-<CFBundleShortVersionString>.dmg`（实测 3.1 MB），卷名「LiveWall」，卷里只有两样东西：

| 内容                            | 作用                                  |
| ------------------------------- | ------------------------------------- |
| `LiveWall.app`                  | App 本体                              |
| `Applications -> /Applications` | 符号链接，用户把 App 拖进去就等于安装 |

**为什么用 DMG 而不是直接发 `.app`**：`.app` 是目录，用 Finder 的「压缩」会丢符号链接与权限位、还会带上 `__MACOSX` 垃圾；DMG 保留全部元数据，双击挂载 → 拖走 → 卸载三步完成，是 macOS 的分发惯例。

**为什么不用 `create-dmg` 那类美化模板**：本机没装 Homebrew（`brew not found`），而美化 DMG（背景图 + 图标位置 + 窗口大小）必须在**可写 DMG**（`UDRW`）里用 AppleScript 驱动 Finder 设置视图属性、再转成压缩格式 —— 多一个外部依赖，换来的只是图标摆得好看。个人自用不值。

脚本里两个值得留意的实现细节：

- **优先 `diskutil image create from --volumeName … --format UDZO`，`hdiutil create` 兜底。** macOS 27 起 `hdiutil create` 已弃用（会打 deprecation 警告，实测仍有 `WARNING: ... is deprecated`），而新命令在老系统上不存在 —— 两条都留着，脚本按可用性自动选。
- **打包后自检**：挂载一次，确认卷里有 `LiveWall.app` 与 `Applications` 链接、`codesign -v` 通过，再卸载。

### 别人第一次打开会被 Gatekeeper 拦住

本 App 是 **ad-hoc 签名、未公证**（公证需要付费开发者账号，与「个人自用 / 小范围共享」的定位不符）。拿到 DMG 的人第一次打开会看到「Apple 无法验证…是否包含恶意软件」，两种放行方式：

1. 右键 App →「打开」→ 再点「打开」。macOS 15 起右键不再直接放行，要先到**系统设置 → 隐私与安全性**，在拦截提示下点「仍要打开」。
2. 终端一行（省掉点设置）：

```bash
xattr -dr com.apple.quarantine /Applications/LiveWall.app
```

**把 App 拖出 DMG 之后再做这一步** —— 直接在只读卷里清 quarantine 没有意义。

## 反编译门槛（字符串混淆、符号剥离、自校验）

**先说清楚定位**：这是个人自用的免费 App，**没有授权 / 内购可破解**，所以加固的目标是抬高
「改一改重新打包分发」的门槛，**不是防住逆向工程**。下面三项各自能挡什么、挡不住什么，
都写清楚了 —— 别把其中任何一项当成安全边界。

### 类型名刻意与文件名不一致（`Folded` / `Seal`）

二进制里的 Swift mangled name 会带上类型名。所以两个与加固直接相关的类型**故意改成了不透露
用途的名字**：`PackedText.swift` 里的类型叫 `Folded`，`IntegrityCheck.swift` 里的叫 `Seal`。
文件名保持描述性（便于维护），类型名不透露用途 —— **这个错配是有意为之，别「顺手改回来」**。

只改这两个，是因为它们的名字直接告诉逆向的人「该改哪里」；把普通业务类型也一起改短名，
收益很低而 diff 很大。另外 `@objc` 方法名（selector）**刻意没动**：只改其中几个反而会把
「哪几个是敏感点」标出来，要么全改要么不改，不在本次范围内。

### 服务端地址不落明文（`PackedText.swift` / 类型 `Folded`）

`Preferences.swift` 的清单 / 更新地址与 `AboutMenu.swift` 的博客 / 赞助地址，都以
「与密钥异或后的字节」形式存储，运行时由 `Folded.open` 还原。

- **效果**：`strings` / `otool -s __TEXT __cstring` 扫不出明文域名（实测改前 3 处 → 改后 0 处）。
- **挡不住**：密钥就在同一个二进制里，能静态还原。挡的是随手 grep，不是逆向。
- **改地址时**：用 `tools/encode-strings.py "新地址"` 重新生成字节数组，别手算。脚本里的
  `KEY` 必须与 `PackedText.swift` 的 `key` 一致；不一致会还原成乱码，但**不会静默** ——
  `LiveWallCoreTests` 断言了还原后的 URL，会立刻失败。
- `open` 上的 `@inline(never)` **不能去掉**：否则 `-O` 可能把常量折叠回明文，混淆白做。

### 发布版剥离符号（`build.sh`）

`swift build -c release` 的产物带完整符号表，`build.sh` 在**签名之前**对二进制跑 `strip -x`。

> ⚠️ **2026-09-21 更正了本节此前的归因。** 原先写「未剥离的二进制泄漏 `/Users/qix` 109 次、
> 全部源码文件路径」—— 用同一批命令复测，**二进制本体里 `/Users/` 是 0 处**；
> 那些路径的实际载体是**同目录的 `.dSYM`**（实测 `/Users/` **306** 处、`.swift` 283 处）。
> 而 `build.sh` 只 `cp` `Contents/MacOS/LiveWall`、**不拷 `.dSYM`**，
> 所以这些路径本来就不会随 `.app` 分发出去 —— 拿它当 `strip` 的理由是错的。
> 真正要盯的是：**哪天打包流程开始拷 `.dSYM`**（例如为崩溃符号化一并分发），那才是真泄漏；
> 而那时 `strip` 帮不上忙，要改的是打包流程。

实测（SwiftPM release / macOS 27 / arm64）：

| 泄漏项                                       | 未剥离         | `strip -x` 后        |
| -------------------------------------------- | -------------- | -------------------- |
| **符号表**（`nm` 可读的内部类型与方法名）    | **25,399 条**  | **2,122 条**         |
| 体积                                         | 1.81 MB        | 1.08 MB              |
| 二进制本体里的 `/Users/`                     | **0 处**       | 0 处                 |
| 二进制本体里的 `LiveWallCore/*.swift`        | **0 处**       | 0 处                 |
| 二进制本体里的 `LiveWall/*.swift`            | 3 处           | **0 处**（已修，见下） |
| 同目录 `.dSYM` 里的 `/Users/`                | 306 处         | 不受影响（独立文件） |
| **Swift 类型名**（`__swift5_*` 段）          | 有             | **仍有**             |

**所以 `strip -x` 的价值在符号表** —— 2.5 万条内部类型与方法名，`nm` 一读就能还原出模块结构。

- **不影响加载**：`strip -x` 只去局部符号，未定义符号与动态库依赖逐条不变（已 diff 验证），
  剥离后仍能正常 ad-hoc 签名并通过 `codesign -v`。
- **必须在 codesign 之前** —— 改二进制会让已有签名失效；**只对 release 剥离**，debug 保留符号便于定位。
- **`strip` 抹不掉三类东西**，前两类都要改源码：
  1. **Swift 类型名** —— 在 `__swift5_*` 元数据段里，不在符号表（见上节，已对两个安全相关类型做了）。
  2. **`fatalError` / `#file` 带进来的源文件名字符串常量**。实测剥离后仍残留 3 处
     `LiveWall/*.swift`，逐一对应三处 `required init?(coder:) { fatalError("不支持从 nib 加载") }`
     —— `fatalError` 的 `file:` 默认值是 `#file`，把文件名当**普通字符串常量**嵌了进去，
     而 `strip` 管的是符号表、管不到字符串字面量。已改成
     `fatalError(..., file: "", line: 0)`（这三条路径永不执行，丢掉崩溃定位信息零代价），
     复测残留 **0 处**，只剩系统框架的 `*.swiftinterface`。
  3. 系统框架的 `*.swiftinterface` 路径 —— 与我们无关，不用管。

### 启动自校验（`IntegrityCheck.swift` / 类型 `Seal`）

启动时用 `SecStaticCodeCheckValidity` 校验自身代码签名是否与二进制自洽，结论**只写日志**。

实测判别能力（macOS 27 / arm64）：

| 场景                               | 结论          |
| ---------------------------------- | ------------- |
| 正常 ad-hoc 签名                   | 通过          |
| 改动签名覆盖区内的字节、**不重签** | 判为被改动 ✅ |
| 从未签名                           | 判为被改动 ✅ |
| 改动后**重新 ad-hoc 签名**         | 通过 ❌       |
| 在签名覆盖区**之后**追加字节       | 通过 ❌       |

**为什么只写日志、不阻断启动**：ad-hoc 签名没有证书锚点，改完重签即可绕过（上表第 4 行），
挡不住有决心的人；而误判的代价（用户整个壁纸功能失效）远大于收益。想要真正的锚，
前提是上 Developer ID 正式签名 + 公证。

## 版本检查与更新

**只提示、只下载，绝不自动安装。**「立即下载更新」把 dmg 拉到 `~/Downloads` 并在 Finder 里选中，
剩下的拖装动作交给用户 —— 覆盖一个正在运行的 App 需要另一条 installer 进程，而且本 App 退出时
要把当前这张的静态图固化成系统墙纸，被外部替换或强杀时那一步就丢了。

### 远程版本信息

`https://studio.meowv.com/data/livewall/version.json`（可由配置 `remoteUpdateURL` 改，**置空即不检查**）：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `version` | ✅ | 展示用（`0.2.0`），**不参与比较** |
| `build` | ✅ | 比对的权威值（`CFBundleVersion`），必须为正整数、发版必须递增 |
| `fileURL` | ✅ | dmg 地址，**必须是 https** |
| `notes` | — | 更新说明，菜单里压成一行显示 |
| `sizeBytes` | — | 包体积，缺失就不显示「大小」行 |
| `sha256` | ✅ | dmg 的 SHA-256（64 位十六进制）。**缺失或格式非法即整体判不可用** |
| `minOSVersion` | — | 低于它就不提示（装了也跑不起来） |

比 `CFBundleShortVersionString` 更可靠的是 `build`：语义化比较会踩 `0.10.0 < 0.9.0` 这类坑。
解析是**防御式**的（`UpdateFeedCoding`）：任一必填字段缺失或类型不对，整体判为不可用并记日志，不留半截数据。

**`sha256` 必填，下载后无条件校验。** 早先是「服务端给了才校验，没给就跳过」—— 那等于把
「服务端漏填」悄悄降级成「不做校验」，用户装到什么都无从判断。现在缺校验值、或格式非法
（非 64 位十六进制）都直接判整份版本信息不可用：**宁可这次不提示更新**，也不给一个无法校验的
下载入口。`make-dmg.sh` 本来就由 `shasum -a 256` 生成这个字段，发版流程不受影响。

> ⚠️ 校验值能防的是「包在 CDN 上被单独替换 / 传输损坏 / 服务端漏填」这类**与版本信息不同源**
> 的改动。它**防不住**能同时改 `version.json` 的人 —— 那种攻击者直接把 sha256 也改掉即可。
> 挡住这一层靠的是**独立密钥的签名**，见下节「更新清单签名」。

**同一目录下还必须有一份 `version.json.sig`。** 缺它、或它验不过，整份版本信息一律判不可用 ——
客户端刻意没有「验不过就跳过」的开关（那种开关一旦存在，攻击者把签名文件删掉即可绕过）。

> 同一份 `version.json` 也被 Studio 壁纸页的桌面 App 推广位读取
> （`studio/src/features/wallpapers/app-promo/`），用于展示版本号、体积并提供下载按钮。
> 那边另有一个静态兜底常量 `LIVEWALL_FALLBACK_VERSION`（拉取失败时使用），**发版后需同步更新**。
> 该推广位**不做验签**（它只展示版本号与下载按钮，不决定装什么），所以那边不受本节影响。

### 更新清单签名（Ed25519，独立密钥）

**为什么 sha256 不够。** `sha256` 字段本身写在 `version.json` 里。能改这个文件的人
（静态站被入侵、发布脚本被改、CDN 被投毒、DNS/TLS 被绕过）就能把摘要和下载地址**一起**换掉 ——
摘要只证明「下载到的文件与清单一致」，证明不了「清单是作者发的」。签名补的正是后者。

**密钥分工：私钥只在本机离线，公钥写死在客户端里。**

| | 位置 | 说明 |
| --- | --- | --- |
| 私钥 | `~/.livewall-signing/version-key.txt`（权限 600，**不在仓库里**） | 只在签名那台机器上。丢了就再也签不出已发布客户端认得的签名 |
| 公钥 | `UpdateSignature.publicKeyBase64`（内嵌进二进制） | 客户端里**唯一的信任锚**。换它 = 必须重新发版 |

用 `tools/sign-version.swift` 管理（四个子命令：`keygen` / `pubkey` / `sign` / `verify`，跑无参数即出帮助）。

**签的是 `version.json` 的原始字节，一个字节都不重排。** 刻意不做「解析出字段再拼成规范串」
那种规范化：那等于要求签名端与验签端实现同一套序列化规则，两边一旦有差异就会出现
「作者签得出、客户端验不过」；更糟的是「攻击者能构造出同一规范串」。
原始字节是唯一没有歧义的输入。

> ⚠️ **代价是发布时必须原样上传**：重新格式化 JSON（换缩进、调键顺序、加删尾随换行）
> 会让签名失效。这是刻意的取舍 —— 宁可发布流程严格，不要验签语义有缝。
> 上传后可用 `verify` 对**线上那一份**再验一次确认。

**签名单独一个文件（`version.json.sig`）**，不写进 `version.json` —— 签名要覆盖该文件的字节，
而它又在该文件里，自我指涉无解。地址由清单地址推导（`URL.appendingPathExtension("sig")`）。

**验不过就是不可用。** 缺签名文件、格式不对、签名不匹配，一律判整份版本信息不可用 ——
**没有「退回只看 sha256」这条路**（那种降级等于没做：攻击者删掉签名文件即可绕过）。

失败原因被刻意拆开，因为排障方向完全不同（手动检查时这几行会直接显示给用户）：

| 原因 | 通常意味着 |
| --- | --- |
| 签名文件不是 JSON（是不是没上传 .sig 文件？） | 漏传 `.sig`；或静态站把 index.html 兜底返回了 |
| 签名算法不受支持 | 用了别的算法，或客户端过旧 |
| 签名长度应为 64 字节 | 签名被截断 / 折行 / 抄错 |
| 签名与版本信息不符 | 清单被改过 / 被重新格式化过 / 密钥换过没重签 |

**实测过的判别力**（`UpdateSignatureTests`，含一条用**真实发布私钥**签出的固定向量）：

| 情形 | 结果 |
| --- | --- |
| 正常签名 | 通过 |
| 改动清单一个字节 | 拒绝 ✅ |
| 只重新格式化（加一个空格） | 拒绝 ✅ |
| 换另一把密钥签 | 拒绝 ✅（证明用的确实是内嵌公钥） |
| 签名文件缺失 / 空 / 非 JSON / 算法不符 / 长度不符 | 拒绝 ✅，且原因可区分 |

> 那条固定向量是**绊线**：谁动了 `publicKeyBase64`（换密钥、改坏、截断），它会立刻红。
> 值得专门留一条的理由 —— 内嵌公钥是客户端里唯一的信任锚，它悄悄变了而没人发现，
> 整套机制就静默失效了，症状是「客户端永远不提示更新」，与「线上没发新版」长得一模一样。
> 实测：换错公钥 → 恰好 4 条断言红，且全部指向信任锚。

**换密钥后必须重新生成这条向量**（旧私钥签的向量一定验不过新公钥）。三步：

```bash
cd livewall

# 1) 原样重现固定向量的字节。**必须用 printf，不能用 echo** ——
#    echo 会多一个尾随换行，字节数 177 → 178，测试里那两条「向量本身合规」的断言会红
printf '%s' '{"version":"9.9.9","build":999,"sha256":"0000000000000000000000000000000000000000000000000000000000000000","fileURL":"https://studio.meowv.com/data/livewall/LiveWall-9.9.9.dmg"}' > /tmp/fixture.json

# 2) 用新私钥签它（sha256 是占位全零，所以不带 --dmg 走摘要对账）
./tools/sign-version.swift sign --json /tmp/fixture.json

# 3) 把 /tmp/fixture.json.sig 里的 signature 值粘回
#    Tests/LiveWallCoreTests/UpdateSignatureTests.swift 的 fixtureSignature
```

> ⚠️ 这第三步**只能「签一份新的」，不能「比对上旧的」** —— 签名不是可复现的，
> 重签出来的字节必然不同（但一样有效）。详见下节。

#### 签名不可复现，但它是标准 Ed25519

CryptoKit 的 Ed25519 **不是确定性签名**：同一把私钥、同一段字节，连签两次得到的签名不同。
这不是 bug，是刻意的 —— 官方文档原话：

> the CryptoKit implementation of the algorithm employs randomization to generate a different
> signature on every call, even for the same data and key, to guard against side-channel attacks.

实测读数：连签 3 次得 3 个不同签名，**三个都能验过**。所以：

- **别用「重签一次、比对是否相同」当验证手段** —— 它永远判不等，看起来像「密钥不匹配」，
  会把排障带向完全错误的方向。要验就用 `verify`（走验签，不做字节比对）。
- **别把「两次签出的 `version.json.sig` 内容不同」当异常** —— 重签必然不同，两者都有效。
- 工具里的自检用的是**验签**（`isValidSignature`）而不是比对，正是为此。

**签名本身是标准 Ed25519，不锁定 Apple 生态**（两个方向都实测过）：

| 方向 | 结果 |
| --- | --- |
| CryptoKit 签 → Node / OpenSSL 验 | 通过 ✅ |
| Node / OpenSSL 签 → CryptoKit（客户端内嵌公钥）验 | 通过 ✅ |

私钥文件里存的是标准的 **32 字节 Ed25519 种子**（base64）——从同一份私钥用 Node 推出的公钥与内嵌公钥
逐字节一致。所以**以后换用别的签名工具不会让已发布客户端失效**，只要能出标准 Ed25519 即可；
反过来，客户端将来换实现也照样能验 Apple 签的。

> 注意**本机自带的 `openssl` 不行**（LibreSSL 3.3.6，`genpkey -algorithm ED25519` 报
> `Algorithm ED25519 not found`），要换工具得用一个支持 Ed25519 的 OpenSSL（≥ 1.1.1）。
> 已验证可用的现成替代是 **Node 自带的 OpenSSL**：把 32 字节种子前面拼上 PKCS#8 头
> `302e020100300506032b657004220420`，`crypto.sign(null, payload, key)` 签出的签名
> 客户端内嵌公钥验得过（上面那张表里那条就是它）。但是 —— **日常发版没必要换**，
> `tools/sign-version.swift` 已经跑通且零依赖，这段只是说明「不锁定」。

#### 签名工具能做什么 / 不能做什么

- ✔ `sign --json <清单> --dmg <dmg>` 会**先对账摘要**：清单里的 `sha256` 与实际 dmg 不一致就拒绝签名。
  不做这一步最容易发生的错误是「签了一份指向旧 dmg 的清单」—— 签名完全有效、客户端也验得过，
  但用户下载后校验必然失败。签名保护的是「清单是作者发的」，不保护「清单里的摘要是对的」，两者分开守。
- ✔ 签完**回读自检**，并且**用客户端内嵌的公钥验一遍**。签名的私钥与内嵌公钥不是一对，是这套机制
  最容易犯的错，症状极隐蔽（本地一切正常，用户那边永远不提示更新）；这一步让它在发版当场炸出来。
- ✘ **不防「用户改自己的客户端」**：ad-hoc 签名没有证书锚点，想换掉内嵌公钥的人本来就能改二进制
  （同 `Seal` 的结论）。防的是「服务端被入侵后向所有人投毒」。
- ✘ **不解决私钥保管**：私钥在本机文件系统上。这是刻意的取舍（见「定位」一节），
  代价是那台机器被入侵就等于私钥泄漏，届时只能换密钥 + 重新发版。

> 为什么签名工具用 Swift 而不是 openssl：本机是 **LibreSSL 3.3.6**，
> `openssl genpkey -algorithm ED25519` 直接报 `Algorithm ED25519 not found` —— 它不支持 Ed25519。
> 用 CryptoKit 写则零依赖，且与客户端同一套实现，不存在「两边实现不一致」的缝。

### 菜单显隐：一个状态说了算

菜单里这一段**只有一个状态字段** `UpdateState`（`LiveWallCore/UpdateState.swift`），
显隐、文案、可点性全部由它派生，改它只走 `AppDelegate.setUpdateState`（幂等：值没变就不重建菜单）。

| 状态 | 菜单长什么样 | 进入条件 | 离开条件 |
| --- | --- | --- | --- |
| `idle` 无更新 | 「检查更新」入口可见 | 初始态；检查结果非「有新版本」（含**失败**）；从 `available` 再次检查却没更新了 | 开始检查 |
| `checking` 检查中 | 「检查更新…」入口**保留但禁用** | 开始一次检查（启动自动 / 手动点击） | 结果回来 |
| `available(feed)` 有新版本 | **隐藏**「检查更新」，只显示「有新版本 X（大小）」那一行，子菜单里只有「立即下载更新」 | 检查结果 `available` | 再次检查后没有更新了 |

- **两者互斥**：`idle` / `checking` 只有入口，`available` 只有更新行 —— 不允许同时出现。
- **没有「忽略此版本 / 稍后提醒」**：前者点了就没有恢复入口（配置里躺着 `ignoredUpdateBuild`，
  界面上再也点不回来），后者点了等于没做。所以更新行要么下载、要么一直挂着，直到装完新版。
- 迁移是**幂等**的：并发连点两次「检查更新」只会产生一次状态迁移与一次请求。

### 触发与降级

- 启动流程结束后延后 5 秒查一次（不跟清单加载抢网络）；距上次检查不足 12 小时则跳过；
  菜单里「检查更新」可无视节流手动触发；网络不可达时**不发请求**，恢复后补一次。
- **自动检查全程静默**：没查到就是没查到，原因只写日志 —— 那时没人在等结果，弹提示是打扰。
- **请求失败 / 超时 / 数据异常一律按「无更新」处理**：状态回 `idle`，「检查更新」入口原样保留，
  不影响启动与播放。只有**手动**点的时候才把原因说出来（状态区附注行）：

  | 判定 | 回执 |
  | --- | --- |
  | 有新版本 | `发现新版本 0.2.0，见下方更新项` |
  | 已是最新 | `已是最新版本 0.1.0` |
  | 判不出来 | `⚠ 更新检查失败：<原因>` —— 含未配置地址、读不到本地 build、拉取/解析失败 |

  三条回执都是**一次性**的（`UpdateMenu.Receipt.isOneShot`）：展示过之后，菜单收起即作废，
  下次展开状态区已经干净。理由 —— 它回答的是「刚才那一次点击」，而真正的待办（有新版本）
  由菜单里的更新行**长期**承载，不需要这行提示一直挂着。被下一次别的操作覆盖是同样的效果。

  作废条件是「**展示过之后**」而不是「收起就作废」：结果回来时菜单可能正开着（那时不能
  重建菜单），用户看到的是上一版菜单里的「正在检查更新…」，而 `notice` 已被覆盖成最终结果 ——
  此时关菜单若直接清掉，清的正是那条还没显示过的回执，等于「点了没反应」。
  `noticeShown` 就是这个判断（写在 `notice` 的 `didSet` 里重置，覆盖全部写入点）。

  为什么不做「几秒后自动消失」：结果回来时菜单往往已经收起，计时从**生成**那一刻起算的话，
  用户再打开时多半已经过期，等于没给回执；而要在菜单展开期抽掉这一行就得重建菜单，
  那会打断正在进行的点击。收起时作废是唯一既不漏看、也不残留的时机。

  ⚠️ 排障先看这一行：**写着「已是最新版本」就等于线上 `build` 没有比本地高**，不是功能坏了。
  最常见的原因是发版忘了递增 `CFBundleVersion`。
- **不会并发**：`UpdateChecker` 用 `isChecking` 挡第二次，节流窗口内的自动检查直接丢弃
  （手动 `force: true` 可无视）。结果本身由状态字段缓存，不必重查。

#### 取数顺序：先验签，再解析

一次检查发**两个**请求：清单本身，以及它旁边的 `version.json.sig`。顺序是硬约束：

```
fetch(version.json) → fetch(version.json.sig) → 验签 → 解析 → 判定
                                                   └─ 不过 → 判不可用，不进解析、不参与判定
```

- **为什么不先解析**：签名不过的清单属于**不可信数据**，不该进解析。解析器本身是防御式的
  （缺字段就判不可用），拿到一份伪造清单照样能解析成功 —— 所以这个顺序值得钉死。
  Core 里把它固化成一个组合入口 `UpdateFeedCoding.decodeVerified`（而不是让调用方自己拼两步），
  这样顺序可以被单测断言：**顺序反了不会报错，只会静默失去防护**。
- **两个请求的失败分开报**：签名文件拉取失败会明说「签名文件拉取失败（version.json.sig）」。
  不退化成笼统的「拉取失败」—— 那会让人去翻版本号和网络，而真正的原因往往是漏传 `.sig`。
- 签名文件地址由清单地址推导（`UpdateSignature.documentURL`）。地址推不出来（给的是目录、
  没有路径、以 `/` 结尾）**判不可用而不是猜一个**：猜错的表现是「拉到一个不存在的位置」，更难排障。

### 发版步骤

```bash
# 1. 递增 Resources/Info-LiveWall.plist 的 CFBundleVersion（客户端只认它，忘了加就永远不提示）
# 2. 根目录一步构建（打 .app + 打 dmg + 签名 version.json + 放进 studio 部署目录）
./build.sh livewall --with-dmg
# 3. 上传
./deploy.sh studio --dry-run && ./deploy.sh studio
```

版本号、dmg 文件名、体积、sha256、`fileURL` 全由 `make-dmg.sh` 从 `Info.plist` 生成，
并在同一步**对清单签名**（产出 `version.json.sig`）。根目录 `build.sh` 只把它们搬进
`build/studio.meowv.com/data/livewall/`（先清旧版本残留），所以不需要、也不要再手工 `cp`。

> ⚠️ **签名这一步需要本机的私钥**（`~/.livewall-signing/version-key.txt`）。换机器发版要先备份 / 拷贝它。
> 签名失败时 `make-dmg.sh` 会**中止而不是产出未签名的清单** —— 一份发不出去的清单
> 比一次失败的构建危险得多（症状是「用户永远看不到更新」，与「线上没发新版」无法区分）。

只跑 `./build.sh studio` 也不会丢分发产物：根目录 `build.sh` 会把已有的 dmg、`version.json`
**与 `version.json.sig`** 一起带进新生成的部署目录。部署后在**线上那一份**上对账一次：

```bash
# 摘要：应与本地构建的 dmg 一致
curl -s https://studio.meowv.com/data/livewall/version.json
shasum -a 256 livewall/build/LiveWall-<版本>.dmg

# 签名：拉下线上两份文件，验证它们确实互相匹配（用客户端内嵌的公钥）
curl -s https://studio.meowv.com/data/livewall/version.json     -o /tmp/live.json
curl -s https://studio.meowv.com/data/livewall/version.json.sig -o /tmp/live.json.sig
./livewall/tools/sign-version.swift verify --json /tmp/live.json --sig /tmp/live.json.sig
```

第二步是**必需**的，不是可选的自检：它同时验了三件事 —— 签名上传成功、线上那份清单没被
重新格式化过、以及**签名用的私钥与客户端内嵌的公钥确实是一对**（最后这条最隐蔽，
本地怎么试都正常，只有拿客户端信任锚去验才会露出来）。

首次发版（或换密钥后）需要先补一步：

```bash
./livewall/tools/sign-version.swift keygen     # 生成私钥，并把打印出的公钥行粘进 UpdateSignature.swift
```

**换密钥 = 必须重新发一版客户端**：公钥是内嵌的，旧客户端验不过新私钥签出的任何东西。
所以 `keygen` 默认拒绝覆盖已存在的私钥（`--force` 可强来，但那是一次有意的断代）。

### 本地验证（不发真实版本）

```bash
python3 -m http.server 8000 --directory /tmp/fakeupdate
```

`/tmp/fakeupdate` 里要放**两个**文件：一个 build 更高的 `version.json`，以及它的签名
`version.json.sig`（对前者原始字节签出）：

```bash
./livewall/tools/sign-version.swift sign --json /tmp/fakeupdate/version.json
```

把 `~/Library/Application Support/com.meowv.livewall/config.json` 里的
`remoteUpdateURL` 临时改成 `http://127.0.0.1:8000/version.json`（http 是**刻意允许**的，就为本地调试），
重启 App 即可看到更新入口。

> 调试「验签失败」这条路径时，故意**只放清单不放 `.sig`**，或改一个字节不重签，
> 菜单里会给出可区分的原因（见上节的原因对照表）。这是验证「失败不会静默」的最快方式。

## 本机实测基线（macOS 27.0 / arm64 / 双屏）

```
CGWindowLevelForKey(.desktopWindow)     = -2147483623
CGWindowLevelForKey(.desktopIconWindow) = -2147483603
系统壁纸进程「墙纸」实际占用             = -2147483625
```

工具链（`swift --version`，2026-09-21）：

```
swift-driver version: 1.168.6  Apple Swift version 6.4 (swiftlang-6.4.0.34.1 clang-2100.3.34.1)
Target: arm64-apple-macosx27.0.0
```

> ⚠️ **编译器是 6.4，但 `Package.swift` 声明的是 `swift-tools-version: 5.9`** ——
> 语言模式因此停在 **Swift 5**，严格并发检查不生效。这正是历史上那两处数据竞争
> （`sharedVideoLoads` 的并发写、同步取数的超时竞态）能编译通过的原因。
> **升到 6.0 的规模已实测**（临时改 tools-version 后编译，未提交）：至少 2 处 error
> （`ScreenCoordinator` 对 `@MainActor` 属性取 key path、`NetworkMonitor` 捕获非 Sendable
> 的 `self`）与十余条 warning（AppKit 调用缺 `@MainActor` 标注、非 Sendable 捕获），
> 且编译会在第一个失败文件处停止，**完整清单还没测全**。属于要单独立项的一批工作。

有效层级区间（左开右开）：**(-2147483625, -2147483603)**，共 21 层可选。

层级标定实测结果：

| 预设                 |        层级 | 在壁纸之上 | 在图标之下 |         同层竞争         | 结论                         |
| -------------------- | ----------: | :--------: | :--------: | :----------------------: | ---------------------------- |
| `desktopWindow`      | -2147483623 |     是     |     是     |            0             | ✅ **推荐基线**              |
| `desktopWindowPlus1` | -2147483622 |     是     |     是     | **1（`WindowManager`）** | ⚠️ 与系统进程同层，见下      |
| `desktopWindowPlus2` | -2147483621 |     是     |     是     |            0             | ✅                           |
| `iconMinus2`         | -2147483605 |     是     |     是     |          未复测          | ✅                           |
| `iconMinus1`         | -2147483604 |     是     |     是     |          未复测          | ✅                           |
| `iconAboveGap1`      | -2147483602 |     是     |   **否**   |          未复测          | 覆盖桌面图标（"专注模式"用） |
| `iconAboveGap2`      | -2147483601 |     是     |   **否**   |          未复测          | 覆盖桌面图标（"专注模式"用） |

### 区间内的实际占用者（macOS 27.0 实测）

「21 层可选」是理论上限，实际有系统进程常驻。按层级自低向高（实测窗口列表）：

|            层级 | 占用者             | 说明                                                     |
| --------------: | ------------------ | -------------------------------------------------------- |
|     -2147483626 | `Window Server`    | 系统壁纸之下                                             |
|     -2147483625 | 墙纸               | 系统壁纸本身，区间的**下界**                             |
|     -2147483624 | `WindowManager`    | 双屏各一个整屏窗口                                       |
| **-2147483623** | **本程序覆盖窗口** | 无竞争                                                   |
|     -2147483622 | `WindowManager`    | 整屏窗口（仅主屏）→ 这就是 `desktopWindowPlus1` 的竞争者 |
|     -2147483603 | 访达               | 桌面图标层，区间的**上界**                               |
|     -2147483602 | `Window Server`    | 菜单栏（实测高 83px）                                    |

**`desktopWindowPlus1` 不再是干净选项。** 实测该层级有一个整屏的 `WindowManager` 窗口，程序自己的同层竞争检测会如实报出：

```
尝试 desktopWindow+1(-2147483622)：层级 -2147483622 | 在系统壁纸之上 ✓ | 在图标之下 ✓ | 覆盖整屏 ✓ | 同层竞争 1 个 ⚠
```

同层的前后顺序由 WindowServer 决定，不由本程序控制 —— 这正是 [`AGENTS.md`](./AGENTS.md) 的「窗口层级与覆盖窗口」里要求**必须保留同层竞争检测**的原因。基线 `desktopWindow` 与 `desktopWindowPlus2` 实测均为 0 个竞争。

`WindowManager` 是系统进程（窗口管理 / Stage Manager 相关），不是第三方壁纸软件。它的窗口在实测中不影响壁纸显示（程序已在日常使用），但**不要据此假定该层级可自由使用**。

> 上表后四行的判定来自较早的实测，本次只在 macOS 27.0 上复测了三个 `desktopWindow*` 预设与三个常量；换系统版本后应重测整表，不要只改标题里的版本号。

## 关键发现

1. **商业实现用的是 `desktopWindow`，不是"图标层 -1"。** 本机正在运行的 Dynamic Wallpaper 的两个窗口（主屏 + 副屏各一个）层级均为 `-2147483623`，正好等于 `CGWindowLevelForKey(.desktopWindow)`，与"图标层 -1"（-2147483604）相差 19 层。两者都在有效区间内，但基线应对齐前者。

2. **多屏是"每屏一个窗口"。** 实测该应用为主屏（1512×982）与副屏（1920×1080）各创建一个覆盖窗口。

3. **同层竞争是真实风险。** 第三方壁纸软件与我们的窗口可能落在同一层级，同层前后顺序由 WindowServer 决定，不由我们控制。启动时的层级自检会检出并报警。

4. **`Dock` 的窗口紧邻我们所在层级**（-2147483622 / -2147483624），恰好夹住 `desktopWindow`。目前不冲突，但值得持续观察。

5. **mp4 格式约束已被真实数据验证。** 样本 CDN 返回 `Accept-Ranges: bytes`、`video/mp4`、`H.264 High@L3.2`、`yuv420p`、30fps，`AVPlayerLooper` 远程循环正常（3 次循环，最大间隔偏差 196ms）。

6. **数据源只有 10 秒预览片。** 每条候选只有 `1920×1080 / H.264 / 30fps / 10.03s / 约 6MB` 的预览片；去掉 URL 里的 `_10s_for_html` 后缀试原片返回 404，原片不公开。因此循环周期固定约 10 秒，切换间隔默认 5 分钟以稀释重复感。当前桌面动态壁纸共 **10 个一级分类**（2026-09-18 快照 20,703 条：美女 2,614、风景 3,384、动漫 2,766、萌宠 2,587、双屏 2,427、其他 2,266、游戏 2,089、科技 2,037、明星 331、分区 202；**条目数随每次 crawl 增长，实时值以线上 `catalog.json` 为准**），每张壁纸只归属一个一级分类。清单体积：**索引 901 字节**，各分类切片 50 KB（分区 202 条）– 815 KB（风景 3,384 条），全部 11 个文件合计约 4.5 MB —— 但客户端**只需要索引 + 当前分类那一份**，所以启动约 0.63 MB。

7. **元数据加载与播放器起播约占 6 秒。** 10 秒的视频要跑满 2 圈需要约 26 秒 —— 做时长相关的观测时要把这个开销算进去。

8. **本机没有 XCTest。** 只装了 Command Line Tools 而无完整 Xcode，`XCTest` 与 `Swift Testing` 均不可用，测试改用 `executableTarget` + 自建断言运行器实现。

9. **窗口必须在 `applicationDidFinishLaunching` 里同步创建。**
   最初把建窗口放在 `DispatchQueue.main.asyncAfter` 里，结果窗口被系统加上**对称边距** —— 1512×982 的屏幕拿到 `9,5 1494x972`，1920×1080 的拿到 `1524,7 1896x1066`，导致「覆盖整屏」判定失败并触发一连串无意义的层级降级。改成启动过程中同步创建后，bounds 精确为 `0,0 1512x982` 与 `1512,0 1920x1080`。
   注意这是**创建时机**的问题，不是窗口属性问题 —— 同一份 `DesktopOverlayWindow` 代码在同步创建时完全正常。

10. **层级判定不能紧跟在建窗口之后。** `orderFrontRegardless()` 是异步的，创建后立刻查窗口列表会查不到自己的窗口，判定返回「未覆盖整屏」。App 需要显式等待窗口上屏（`ScreenCoordinator.waitForWindowsToAppear`，自旋上限 1 秒）。

11. **`AVPlayerLooper` 循环远程 URL 不会重复下载。** 实测用 `nettop` 按进程采样：单曲循环 130 秒、完成 12 次循环，字节计数**从第 1 个样本到第 13 个样本完全冻结在 12.57MB**。若每圈重下应是 12 × 6.28MB = 75MB。**结论：纯流式可行，不需要落盘缓存。**

12. **但每个视频会被下载两遍 —— 如果建了两个 `AVURLAsset`。** 12.57MB ≈ 2 × 6.28MB。原因是元数据校验建一个、播放再建一个，每个都会把整个文件拉一遍。改成 `AVPlayerItem(asset:)` 复用同一个 asset 后，实测降到 **6.53MB/个**（含 HTTP 开销）。注意 `AVURLAssetPreferPreciseDurationAndTimingKey` 的取值**不影响**流量，别在这上面找原因。

13. **AVFoundation 的 404 错误描述里没有状态码。** 实测 `asset.load(.isPlayable)` 对 404 抛出的本地化描述是 `"在此服务器上找不到所请求的URL。"`，**完全不含数字**。曾写了一套正则想从错误文本里捞状态码，被这条实测证伪。改为**播放前先做一次 HEAD 探测**，直接拿 HTTP 状态码分类 —— 否则无法区分「资源失效」（该拉黑）和「服务器临时故障」（不该拉黑）。

14. **`AVPlayerItemVideoOutput` 必须挂在 `player.currentItem` 上，挂 template item 无效。** 探针实测（24 秒、10 秒片循环 2 圈）：

    | 挂载位置                          | 抓帧数 | 首帧   |
    | --------------------------------- | -----: | ------ |
    | `AVPlayerLooper` 的 template item |  **0** | 未取到 |
    | `player.currentItem`              |    106 | 0.20s  |
    | `player.items()` 全部（3 个）     |    104 | 0.15s  |

    `AVPlayerLooper` 复制 template item 时不会让 output 生效。**顺带一条反直觉的**：`AVAssetImageGenerator(asset:)` 复用播放中的同一个 `AVURLAsset` 抓帧也是**零额外流量**（播放器已把整段缓冲），可作为第二兜底。

15. **抓帧不产生额外流量。** 对照组（只播放）传输 6,239,902 字节，实验组（播放 + 挂 output 抓帧 106 次）6,388,399 字节 —— 差异是 HTTP 分片开销，**不是** 6 MB 级别的重下。解码数据本来就在缓冲里。

16. **`NSWorkspace.setDesktopImageURL` 在本机（macOS 27）即时生效。** 交替设置两张纯色图，每次 `desktopImageURL(for:)` 读回都与期望一致，且能连续切换。注意这**只证明 API 层生效**；「锁屏是否真的显示它」需人眼锁一次屏确认。macOS 15 起社区有「设了不刷新」的报告，所以这个前置验证值得保留。

17. **`coverUrl` 的数据事实（全量 20,703 条，2026-09-18）。** 100% 有值，域名全是 `cdn-ali-img-livebz.shanhutech.cn`；其中 **20,447 条与视频同资源 id，256 条不同**（一部分是 `.png`，一部分日期段不同）。所以**不要用「换域名 + 去掉 `_10s_for_html` + 改成 `.jpg`」推导静态图地址** —— 那 256 条会推错。抽样 19 条 HEAD 全部 200，`Content-Type` 为 `image/jpeg` 或 `image/png`，体积 46 KB – 4 MB。另：`asset.accessible` 对静态图**不是真实探测结果**（`pipeline` 从不做 HEAD，走默认值 1），客户端必须有抓帧兜底。

18. **共享加载表被并发读写会直接崩，且症状完全不像竞态（2026-09-21，真机崩溃后定位）。** 现场是 `-[NSTaggedPointerString count]: unrecognized selector sent to instance 0x8000000000000000`，栈顶落在 `libswiftCore` 的 `Dictionary._Variant.setValue` 上、紧挨着 `AppDelegate.loadVideo`。根因：`loadVideo` 是**非隔离的 `async` 函数**，函数体跑在**协作线程池**上（不是主线程，也不是调用方所在的 actor），而「每屏独立」模式下两个槽位会**同时取片** —— 两个线程同时改 `sharedVideoLoads` 这张 `Dictionary`，存储指针被写坏，运行时随后把垃圾指针当成 ObjC 对象去发 `count:`。用同构探针（两个 worker 反复查表 / 建表 / 删表）**必崩**，加锁版 3/3 干净。修法：读、写、清空一律走 `takeSharedLoad` / `releaseSharedLoad` / `drainSharedLoads`，**检查与插入必须在同一把锁里**（分开做会让同一条视频被并发拉两遍，等于去重失效），**取消任务要放在锁外**。教训：崩溃栈里出现 `libswiftCore` 的集合帧 + `NSTaggedPointerString` 时，先问「谁在别的线程改这个集合」，不要去看字符串。

19. **`NSMenu.autoenablesItems` 会静默覆盖手写的 `isEnabled`（2026-09-21 实测，星哥发现「能点但没反应」）。** 该属性默认为 `true`：展开菜单时 AppKit 会把**带 target/action 的项**重新校验一遍；没实现 `NSMenuItemValidation` 时判定退化成「target 能不能响应这个 action」，于是构建时写的 `isEnabled = false` **被覆盖成 true**。症状是「菜单项看起来能点，点了没反应」—— 比一开始就置灰更糟。探针实测：无 `validateMenuItem` → `update()` 之后 `isEnabled=true`（复现）；实现它并返回 `false` → 保持 `false`；返回 `true` → `true`。**`action: nil` 的说明行不受影响**（target 为 nil，不被校验）—— 所以此前只有「内容过滤」这类**父项**的置灰是真正生效的。修法：带 action 的项判据一律写进 `AppDelegate.validateMenuItem(_:)`，`buildXxxMenu` 里不要再写 `isEnabled`（写了不生效，只会让人以为改那里就够了）。这一条同时修好了另外五处**此前一直没真正生效**的置灰：`下载当前壁纸`（没有可下载条目时）、`固定`（没有正在播的条目时）、`内容过滤`（条目数为 0 的分类）、`空闲阈值`（总开关关着时）、`检查更新`（`updateState` 说不可点时）。

## 省电策略

采集与判定**刻意分离**：`PlaybackGovernor`（LiveWall）只负责把系统状态读出来，判定 `PlaybackStateResolver`（LiveWallCore）是纯函数，可以穷举验证。

### 信号与优先级

从高到低，命中即停。**顺序是硬约束**，代码里有对应注释说明理由：

| 顺序 | 信号           |     默认     | 采集方式                                  |
| ---: | -------------- | :----------: | ----------------------------------------- |
|    1 | 用户手动暂停   |      —       | 菜单点击                                  |
|    2 | 屏幕已锁定     | 开（不可关） | `com.apple.screenIsLocked` 通知           |
|    3 | 显示器休眠     | 开（不可关） | `NSWorkspace.screensDidSleepNotification` |
|    4 | 画面被完全遮挡 |    **开**    | 2 秒轮询窗口列表                          |
|    5 | 系统温度偏高   |      开      | `thermalStateDidChangeNotification`       |
|    6 | 长时间无操作   | 开（300 秒） | 2 秒轮询空闲时间                          |
|    7 | 低电量模式     |      开      | 2 秒轮询 `isLowPowerModeEnabled`          |
|    8 | 电池供电       |      关      | 2 秒轮询 `IOPSCopyPowerSourcesInfo`       |

只有「手动暂停」不可被其他信号撤销；其余都是「任一命中即停，全部解除才恢复」。**只有两态，不降帧** —— 素材是 10 秒 1080p30，解码负担本来就低，降帧要动 `AVMutableVideoComposition.frameDuration`，复杂度与收益不成比例。

状态翻转才回调，2 秒轮询不会刷日志；实测切窗口到状态更新延迟 ≤ 2 秒。

### 遮挡检测：坐标压缩法

这是收益最大的一项 —— 此时画面根本看不见。判定逻辑在 `LiveWallCore.CoverageGrid`，两条被实测否掉的路：

- **union + bounding box**（旧实现）：两个左右并排、各占 40% 的窗口，bbox 合起来就是整屏 → 误判成「完全遮挡」，用户明明看得见却被暂停。
- **网格采样**：20px 的缝隙比 63px 的网格还窄，没有任何采样点落进去 → 报告「覆盖 100%」。这是系统性盲区，提高分辨率治不了。

实际用**坐标压缩法**：按所有矩形的 x/y 边界把屏幕切块，边界对齐后每块要么整块在内要么整块在外，用块中心判定即可得**精确面积**。窗口数通常 < 20，块数千级，2 秒一次无压力。容错 0.5%（亚像素误差不该让判定翻转）。

参与判定的窗口需 `layer >= 0`（排除桌面层与状态栏层）、`alpha >= 0.99`（半透明窗口看得见壁纸，不算遮挡），并排除自身 PID。

### 播放器服从状态

暂停的**唯一落点**是 `applyPlaybackState`，各处系统通知只更新信号、不直接碰播放器 —— 否则多路信号会互相打架。两处易漏的旁路也都堵住了：

- `VideoLoader.load` 是异步的，加载期间状态可能翻成暂停。加载完成后**必须再查一次状态**，否则「暂停时正好有加载在飞」会让壁纸在没人看见的时候自己播起来。画面保持就位（已解码缓冲），恢复时无缝续上。
- `advance()` 开头统一检查状态，避免遮挡/锁屏期间被网络恢复之类的旁路触发拉流。

### 菜单

菜单是**六段结构**：状态 → 播放控制 → 设置 → 维护 → 关于 → 退出。退出项单独置底并与关于分隔，点击后走 `shutdown()`；`pkill -x LiveWall`（SIGTERM 由信号源接住）仍走同一条清理路径。菜单从光标位置向下展开，到达成本与行号正相关，所以高频动作贴顶、低频与破坏性操作置底；同一类别连续成块，破坏位置记忆的插入一律不做。

**状态区**（顶部，全部为禁用行）：

| 行                             | 出现时机   | 内容                                                                                      |
| ------------------------------ | ---------- | ----------------------------------------------------------------------------------------- |
| `动态壁纸`                     | 恒有       | 分组标题                                                                                  |
| 片名                           | 恒有       | 当前（或最后一次成功播放的）条目名                                                        |
| `内存 xxx MB · CPU x%（近 …）` | 恒有       | 进程自身占用，只在展开菜单时更新（见[进程自身占用](#进程自身占用cpu--内存)）              |
| `已暂停：<原因>`               | 仅非播放态 | 原因直接读 governor 状态推导（手动 / 遮挡 / 锁屏 / 息屏 / 热压力 / 空闲 / 低电量 / 电池） |
| `⚠ 网络不可达，保持当前画面`   | 仅不可达   | 网络状态                                                                                  |
| 附注                           | 有条件     | 见下                                                                                      |
| `⚠ 热键冲突：…`                | 仅注册失败 | 用户唯一能发现「热键被别的程序抢了」的地方                                                |

**片名与附注刻意是两个字段**。以前共用一个，失败时片名会被「候选池已耗尽」顶掉，用户看不到正在循环的是哪张，容易误读成「壁纸掉了」。附注行分**信息**与**警告**两级，前缀只加在警告上：

- 信息（原样显示）：操作回执，如「开机自启已开启」「窗口层级：…」「多屏策略：…」
- 警告（加 `⚠`）：真异常，如「候选池已耗尽」「分类「X」没有可用内容」「保持当前画面」「已暂停调度」

给回执加警告符号会让人以为操作失败了。附注在下一条成功加载时清空。

附注行还有一个**生命周期**维度（`Notice.isOneShot`）：默认是常驻（留到被下一个事件覆盖），
只有「用户点了某个菜单项」的应答是一次性的 —— **菜单收起即作废**，下次展开状态区已干净。
目前只有更新检查的三条回执属于这一类（见上文）。区分是必要的：真异常若也一次性，
用户隔很久才打开菜单就会把它整段漏掉。

**热键状态不常驻**：三项组合提示已写在各自菜单项的标题里，再常驻一行纯属重复；只有真冲突时才出现一行。

`省电设置` 子菜单逐项开关，改动直接写回 `config.json` 并立即重算，不需要重启。`无操作时` 下面挂着「空闲阈值」子菜单（1 / 5 / 10 / 30 分钟）。

设置段与维护段各有新项：

| 项                  | 位置                                 | 行为                                                                                                                      |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `锁屏预览（开/关）` | 设置段，紧跟「省电设置」             | 见[锁屏预览](#锁屏预览)。**关掉时会立刻把系统墙纸恢复成用户原来的那张**，否则锁屏仍是最后一张静态图，用户会以为开关没生效 |
| `打开动态壁纸`      | **维护段最前**                       | 打开浏览窗口，见[动态壁纸浏览窗口](#动态壁纸浏览窗口)。**单窗口复用**：已开着就只前置，不重复开；**不暂停桌面播放**。**本地文件夹来源下置灰** |
| `下载当前壁纸`      | **维护段**，位于「重新加载清单」之上 | 见[下载当前壁纸](#下载当前壁纸)。主槽位没有正在播的条目时置灰；下载中标题变「下载中…」并置灰；**本地文件夹来源下置灰**        |

「下载当前壁纸」放维护段而不是播放控制段：它不改播放状态、不改配置，与「重新加载清单」同属低频的一次性动作。
「打开动态壁纸」同样不改播放、不改配置，排在这一段最前 —— 它是唯一一个「浏览 + 挑选」性质的入口，
与后面两个「产出 / 恢复」动作不同类。

**关于段**（末段）只有一项 `关于动态壁纸`，展开是：

| 行                    | 类型       | 行为                                                                                                                |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `当前版本 0.1.0`      | 禁用行     | 版本号，从 `Contents/Info.plist` 的 `CFBundleShortVersionString` 读（不经 .app 直接跑可执行文件时回退成「开发版」） |
| `检查更新` / `有新版本 X` | 更新段   | **紧贴版本行** —— 它回答的就是「我这个版本是不是最新的」。两者互斥，见上文状态表                                 |
| `作者：阿星𝑷𝒍𝒖𝒔`      | 可点       | 打开作者博客 `meowv.com`                                                                                            |
| `赞助支持`            | 可点       | 打开 studio 首页（页脚有「赞助支持」入口，点开是二维码弹窗）                                                        |

更新段与作者之间、作者与赞助之间各有一条分隔线。内容（顺序、禁用行、链接）全在
`LiveWallCore/AboutMenu.swift` —— **作者名、博客地址、赞助入口只在那里维护一份**，
改文案不用动 `AppDelegate`。更新段在那里是一个 `.updateSection` **占位**：位置可单测，
具体内容（入口还是更新行、文案与动作）由 `UpdateState` 决定、由 `AppDelegate` 填。

**赞助为什么指向 studio 首页而不是直接给二维码**：二维码在 studio 页脚那个弹窗里，把用户送到那里就够了 —— 客户端不必自己存二维码，二维码换位置或换渠道也不用改客户端。

**「不做 App 内二维码弹窗」这条结论没变，但理由换了。** 原先的理由是「那会是本项目第一个普通 UI 窗口，还要在 `LSUIElement` 下自己处理激活、焦点与关闭行为」—— 这套成本**已经在浏览窗口上付过了**（见[动态壁纸浏览窗口](#动态壁纸浏览窗口)），所以它不再是拦路虎。现在仍然不做的理由是**维护面**：二维码是运营素材（可能换渠道、换图、换尺寸），内置进客户端就得跟着发版才能改，而 `AboutMenu` 里只维护一个 URL 就永远不用改；而多出来的收益只是「少跳一次浏览器」。与「不做美化 DMG」「不做本地视频缓存」是同一类取舍 —— **能不内置的外部素材就不内置**。

**阈值默认 300 秒而不是更短**：读文档、盯着代码想事情的时候鼠标本来就不动，太短会让画面在用户明明看着它的时候冻住 —— 这是最容易被感知为「坏了」的一项。

### 有意不做的两件事

- **暂停时不释放播放器。** `pause()` 只调 `player.pause()`，解码停止，但 `AVPlayer` 仍持有已下载的缓冲（约 6.5MB）与解码器实例。`teardown` + 重建能让长暂停（息屏数小时）释放内存，但恢复时画面会迟到约 1 秒且要重新下载 —— 权衡后选择保持。
- **低电量模式走轮询而不是通知。** `NSProcessInfoPowerStateDidChange` 只在 iOS 声明，macOS SDK 里查不到，`ProcessInfo` 也没有对应静态成员。2 秒轮询 `isLowPowerModeEnabled` 的代价可忽略。

## 进程自身占用（CPU / 内存）

状态区常驻**一行**（`内存 128 MB · CPU 2.3%（近 3 分钟）`），显示**本进程自己**的 CPU 与内存。
只回答「我自己用了多少」：数值全部来自 `getpid()` 的 `proc_pid_rusage`，不遍历其它进程、
不读整机统计（`host_statistics` 一类刻意不用）。

刻意**并成一行**而不是两行：状态区已经有片名、暂停原因、网络状态、附注、热键冲突等行，
再占两行会把真正要紧的东西挤下去。

这一行有**四种状态**，必须区分开：

| 状态                 | 显示                                  | 触发条件                                            |
| -------------------- | ------------------------------------- | --------------------------------------------------- |
| 没采到               | `内存 测量中… · CPU 测量中…`          | 菜单还没展开过                                      |
| 采过但失败           | `内存 暂不可用 · CPU 暂不可用`        | `proc_pid_rusage` 没拿到数据                        |
| 拿到了但算不出占用率 | `内存 12 MB · CPU —`                  | 没有基线，或区间 < `minimumWindowSeconds`（0.25 s） |
| 有数据               | `内存 128 MB · CPU 2.3%（近 3 分钟）` | 正常                                                |

第二、三种都**不能显示成 0%** —— 那会被读成「这个进程完全不占 CPU」，是假数据。第三种里内存
是瞬时量、本来就有值，所以只把 CPU 写成 `—`，不连内存一起废掉。
采样失败时 `ProcessMonitor.sample` **必须回调 nil**，不能静默返回 —— 否则这一行会永远停在
「测量中…」，用户没有任何办法知道真相是取不到。

### 惰性采样：展开才采，收起即停

| 时机         | 回调              | 动作                                                  |
| ------------ | ----------------- | ----------------------------------------------------- |
| 显示前要内容 | `menuNeedsUpdate` | 发起采样（最早的时机，结果最可能在菜单出现前就填好）  |
| 即将展开     | `menuWillOpen`    | 置 `isMenuOpen`；**只在前者没被回调时**才兜底发起一次 |
| 已收起       | `menuDidClose`    | 取消未完成的采样并释放它                              |

**每次展开只采一次是硬要求**（`sampledThisOpen` 锁住）。两个回调各采一次会算出
「CPU 134%（自启动 0 秒）」这种纯噪音 —— 见下面的实测坑。

**没有后台轮询、没有常驻定时器**。代价是菜单收起期间数字不会变 —— 所以这两行的值只存在于
「菜单里」，状态项本身只有图标。想让数字常驻可见就必须起定时器，那与「零常驻开销」冲突。

CPU 占用率是**区间量**，单次采样只有累计值，必须两次求差：基线是上一次查看（第一次查看时是
启动那一刻的一次性采样）。因此这一行**必须带区间标注**（`近 3 分钟` / `自启动 1 小时`），
否则会被读成瞬时值 —— 而瞬时值根本没采。

### 不阻塞主线程

采样跑在 utility 队列上，结果回主线程后**只改这一行的 title**，不重建菜单 —— 重建会让正在
展开的菜单闪一下并重置已展开的子菜单。菜单收起后回来的结果用递增的代号丢弃；
`DispatchWorkItem.cancel()` 挡不住「已经在跑」的那一个，代号能。

### 实测坑（macOS 27.0 / arm64）

1. **`task_info(MACH_TASK_BASIC_INFO)` 的 CPU 时间恒为 0** —— 网上流传最广的那种写法。
   实测 `user_time` / `system_time` 都是 0，而同一结构体里的 `virtual_size` / `resident_size`
   有值，且返回 `KERN_SUCCESS` —— 不是调用失败，就是这两个字段没填。直接用会得到一个
   永远 0% 的占用率，而「0%」看起来完全合理，极难发现。**别改回那种写法。**
2. **`ri_user_time` / `ri_system_time` 的单位是 mach 滴答，不是纳秒。** 本机时间基 125/3
   （≈41.67 ns/滴答）。烧 1.0 秒 CPU 实测：原始值 23,596,390 → 换算后 0.983 秒，与 `clock()`
   的 0.983 秒一致；不换算会得到 0.024 秒，**差 41 倍**。
3. **睡眠对照组必须做**：睡 0.5 秒时两种取法都是 0.000 秒 —— 证明测的是 CPU 时间而不是墙钟。
4. **同一次展开采两次会得到纯噪音。** 第一次的结果回到主线程后把基线推进到「刚刚那一刻」，
   第二次就拿着一个 ≈0 的区间做除法 —— 实测算出「CPU 134%（自启动 0 秒）」「CPU 145%」，
   而进程其实是空闲的。**区间必须有下限** `minimumWindowSeconds = 0.25`：
   低于它就不给占用率（显示 `CPU —`），并且**不推进基线** —— 推进了的话下一次查看会退化成
   「距上一次几乎为 0」，一连串假数据。只有「压根没有基线」时才顺手补一个。

### 真机验证（探针，已拆）

用 `#if DEBUG` + 环境变量门控的临时探针，把提前 return 放在建窗口之前（零桌面占用），
直接调 `menuNeedsUpdate` / `menuWillOpen` / `menuDidClose` 走真实链路，三轮结果：

```
PROBE[打开前] 内存 测量中… · CPU 测量中…
PROBE[空闲段] 内存 12 MB · CPU —                ← 区间太短，不编数据
PROBE[忙段]   内存 14 MB · CPU 29%（自启动 2 秒） ← 烧 0.5 s CPU / 区间 1.86 s
PROBE[静置后] 内存 14 MB · CPU 0.0%（近 3 秒）    ← 基线已推进，文案切成「近」
```

第三轮是关键：证明基线确实在推进、文案按基线来源在「自启动 / 近」之间切换。
探针代码已删除（`git diff` 里不会看到 `LIVEWALL_PROBE_USAGE` 或 `probeUsageMenu`）。

内存用 `ri_phys_footprint`，口径与活动监视器「内存」列一致（实测分配 80 MB 后从 1.9 MB 涨到
82 MB）。峰值只取历史最大值、不衰减 —— 它的用途是看有没有泄漏。

## 锁屏预览

把当前壁纸对应的**静态图**同步成系统墙纸，这样锁屏界面上看到的就是当前这张。

### 为什么只能是静态的

锁屏界面由 `loginwindow` 在安全罩层级绘制，**第三方窗口提不到它之上** —— 能提上去就等于能伪造登录框，所以这是系统刻意的设计。锁屏能看到的只有**系统墙纸本身**。

而本 App 的覆盖窗口在系统墙纸**之上**：

```
系统墙纸进程(-2147483625) < 覆盖窗口(-2147483623) < 桌面图标(-2147483603)
桌面态：静态图被覆盖窗口挡住 → 用户看不见，不影响观感
锁屏态：覆盖窗口被安全罩挡住 → 露出的正是这张静态图
```

真要走「锁屏也播视频」，只有 Apple 的私有 `WallpaperExtensionKit`（在 `WallpaperAgent` 里挂 `.appex`，Phosphene 那套）一条路：需要完整 Xcode + 签名 + 私有框架 `dlopen`，系统大版本升级就可能失效 —— 与本项目「只用 Command Line Tools、零依赖」的定位冲突，不做。

### 来源与回退链

1. **清单里的静态图** `coverUrl`（数据库 `media_role='image'`，由 `wallpapers export-livewall` 导出）。
2. 拿不到或下载失败 → **抓当前播放帧**（`AVPlayerItemVideoOutput`）。
3. 两者都失败 → **保持系统原墙纸不动**，只记日志（首次失败额外给一次菜单警告，之后不重复刷）。

抓帧的三条硬约束都经真机探针验证：

- output 必须挂在 **`player.currentItem`** 上。挂在 `AVPlayerLooper` 的 template item 上**取不到帧**（实测 24 秒 0 帧 vs 挂 currentItem 后 0.20 秒拿到首帧）。
- 抓帧**不产生额外流量**（实测抓帧期间新增传输 0 字节）。
- 抓帧只能在**播放中**做：锁屏通知到达时 governor 已经把播放器暂停了，那一刻只复用已缓存的图（`reapplyCached`）。

### 写入策略

- **只跟随主槽位**：系统墙纸全局只有一张，每屏独立模式下以主槽位（`engine.primaryKey`）为准。
- 目标屏按多屏策略走（`MultiScreenPolicy.targetScreens`）：镜像与每屏独立写全部目标屏，「仅主屏」只写主屏。
- **签名变了立刻写**（换片 / 目标屏变化 / `coverUrl` 变化），签名没变则按 60 秒最小间隔节流。
- 缓存文件名**两个槽位交替**（`cover-0.jpg` / `cover-1.jpg`）：同一路径重复设置系统墙纸不一定触发刷新，换文件名最省事。
- 换片后**不等下载完成**（独立 Task，最长 15 秒超时），不拖慢切换排期。

### 退出时把当前这张的静态图留在桌面上

退出**不是**恢复用户原墙纸 —— 那样桌面会跳回一张跟刚才播放内容毫不相干的图。要的是「卡在当前这一张」：`shutdown()` 里调 `freezeCurrent`，**同步地**（退出没有时间窗，不能 await 下载）按下面顺序取图：

1. 当前这条的静态图已经写过 → 直接再设一遍（顺带兜住 `setDesktopImageURL` 的生效延迟）。
2. 刚换片、封面还在下载 → **抓当前帧**补上。必须在 `engine.teardown()` **之前**调用，播放器还在播才取得到帧。
3. 都拿不到 → **保留现状不动**，绝不把墙纸清空。

随后给主线程 0.3 秒让 `setDesktopImageURL` 落地，再 `reapplyCached()` 一次 —— 生效有延迟，而进程马上就要死，这恰恰是最没机会生效的一次写入。

实测（2026-09-20，单屏主槽位）：

```
[12:08:44.673] 播放 4215 可爱女孩(1920×1080) 时长 10.03s 编码 avc1 [共用]
[12:08:45.820] 锁屏预览已更新：cover-0.jpg（静态图）→ 1 块屏
[12:08:52.690] 收到信号 15，开始退出清理
[12:08:52.693] 退出固化：复用已缓存的 cover-0.jpg → 1 块屏
[12:08:52.995] 锁屏预览：锁屏时重设 1 块屏
```

上一张（5450）用的是 `cover-1.jpg`，退出时固化的是**正在播的 4215** 那张 `cover-0.jpg`；退出后用 `NSWorkspace.desktopImageURL` 读回确为 `cover-0.jpg`（140578 字节，与 12:08:45 那次写入一致）→ 改版前「停在上一张」的现象已消除，且 `setDesktopImageURL` 在退出流程里**来得及生效**。

**用户原墙纸仍然要记，但只在关掉开关时用。** 退出会刻意把封面留下，于是下次启动读回来的「原墙纸」多半是本 App 自己的图，不能信。真原墙纸只在第一次运行时拿得到，因此持久化到 `~/Library/Application Support/com.meowv.livewall/original-wallpapers.json`（`displayID → 路径`，只写一次），并且识别出系统墙纸落在自家缓存目录里时（`LockScreenPreviewPolicy.isOwnCacheFile`）**不记录**。

「没记到」不是终局：只要 `originalWallpapers` 还空着，之后每次换片都会再读一次系统墙纸 —— 于是用户在会话中途手动换了壁纸也能被记住（这条提示日志只打一次，不会每换一张片刷一行）。

**关掉菜单里的「锁屏预览」开关走的是同一个 `restoreUserWallpaper()`，这条路径已真机验证**（2026-09-18）：

```
[21:38:13.236] 锁屏预览 → 关
[21:38:13.243] 锁屏预览：已恢复原墙纸 1 块屏
```

退出清理走 `shutdown()`，入口是菜单底部的「退出动态壁纸」、`pkill -x LiveWall`（SIGTERM 由信号源接住）与系统终止 —— 三者共用同一条路径，含固化当前这张的静态图。Cocoa 默认不处理 SIGTERM，这正是仍需安装信号源的原因。

实测记录（2026-09-18，单屏，macOS 27）：

```
[20:58:17.717] 播放 4364 凉凉夏风(1920×1080) 时长 10.05s 编码 avc1 [共用]
[20:58:17.742] 锁屏预览：清单里没有静态图地址（4364），改用抓帧
[20:58:18.166] 锁屏预览：已抓当前帧 1920x1080 → cover-0.jpg（391335 字节）
[20:58:18.169] 锁屏预览：已记录原墙纸（/System/Library/CoreServices/DefaultDesktop.heic），关闭锁屏预览时恢复
[20:58:18.177] 锁屏预览已更新：cover-0.jpg（抓帧）→ 1 块屏
```

读回校验：系统墙纸从 `DefaultDesktop.heic` 变成 `…/com.meowv.livewall/cover-0.jpg`（`NSWorkspace.desktopImageURL` 读回一致）。抓帧从发起到落盘约 0.45 秒。

> 上面那条日志是**线上清单还没有 `coverUrl`** 时的样子（走抓帧兜底）。重新导出并部署清单后，正常路径会变成「静态图已缓存 cover-N.jpg → 锁屏预览已更新」。

## 下载当前壁纸

手动把当前这张保存到本地，入口在**维护段**（`下载当前壁纸`）。

| 项       | 约定                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| 下载内容 | **视频 + 静态预览图**（有 `coverUrl` 才下），同基名成对                                |
| 落点     | `~/Downloads/livewall/`                                                                |
| 文件名   | `<id>-<清洗后的标题>.<ext>`，扩展名从 URL 取（静态图有 `.jpg` 也有 `.png`）            |
| 触发条件 | 主槽位有正在播的条目（否则菜单项置灰）；同一时刻只允许一个下载任务                     |
| 失败处理 | 视频失败 = 整个动作失败（警告附注）；静态图失败 = 视频仍保留，附注说明「静态图未保存」 |

文件名清洗规则在 `LiveWallCore/DownloadNaming`（纯逻辑，有单测）：`/ : \ * ? " < > |` 与换行制表符替换成 `_` → 连续空白压成一个空格 → 去掉首尾空白与点 → 截断 60 字符 → 空则退化成只用 `<id>`。

用 `id` 前缀是为了：不同条目重名不会互相覆盖，同一条目重复下载是覆盖同一路径（内容一致，不必堆副本）。

真机实测（2026-09-18）：

```
清洗后的标题：蒙眼天使_测试_文件名            （原标题：蒙眼天使/测试:文件名）
视频下载 OK：162264-蒙眼天使_测试_文件名.mp4（6239902 字节）
静态图下载 OK：162264-蒙眼天使_测试_文件名.jpg（216797 字节）
内容类型校验生效：内容类型不符：video/mp4      （把视频当图片下会被拦住）
404 被识别：HTTP 404
```

**菜单实点两次**（21:38，线上清单还没有 `coverUrl`，走的是「只存视频」分支）：

```
[21:38:23.383] 下载当前壁纸：视频 5448-打电话的女孩.mp4（6122664 字节）
[21:38:23.384] 下载当前壁纸：该条目没有静态图地址，只保存视频
[21:38:23.384] 下载当前壁纸完成 → /Users/qix/Downloads/livewall
```

`~/Downloads/livewall/` 下得到 `5263-性感女孩.mp4` 与 `5448-打电话的女孩.mp4` —— 文件名符合 `<id>-<标题>.mp4` 约定，两次点击互不干扰。

## 动态壁纸浏览窗口

入口在**维护段**（`打开动态壁纸`），打开一个 1060×660 的普通窗口（最小 880×560）。
**本地文件夹来源下这个入口置灰**：窗口列的是线上分类的条目，本地没有可浏览的目录；
已经打开的窗口不会被自动关掉（它是只读的，不影响桌面播放）。
这是本项目**第一个普通 UI 窗口** —— 此前刻意不做 App 内窗口，那条取舍在 2026-09-20 被明确打破（见[菜单](#菜单)里「不做 App 内二维码弹窗」那一段）。

### 两栏布局

| 栏 | 宽度      | 内容                                                                 |
| -- | --------- | -------------------------------------------------------------------- |
| 左 | 76 pt     | 分类列表（`NSTableView`）。字体 14 pt、行高 28 pt，0 条的那些置灰不可选 |
| 右 | 弹性 ≥460 | 条目网格（`NSCollectionView` + 流式布局），列数随右栏宽度自适应       |

**分类栏收到 76 pt**：清单里的分类名实测**都是两个字**，138 pt 会留下大片空白。76 − 16（左右各 8）= 60 pt 仍放得下四个字。字体同时从 12 放到 14、行高从 24 放到 28。

**没有第三栏，也没有底栏**：预览改成双击某张卡片时浮在网格上的一层（见[双击打开预览](#双击打开预览)）；底部那行 `<分类名> · 共 N 条` 也去掉了 —— 条目数在网格里一眼看得到，为它独占 26 pt 不划算。

**卡片宽度不再固定**，改成按列宽撑满：列数随网格宽度在 **3 / 4 / 5** 之间切换（阈值 880 / 1120，按「均分后卡宽落在 180–260 pt」定的），卡宽 = 可用宽度均分，卡片高 = 宽 × 9/16 + 26。实测窗口 1060 → 4 列、1400 → 5 列、最小 880 → 3 列，右侧余量 **1 pt**。

**卡片内不放按钮** —— 网格里每格塞按钮既挤又容易点错，操作集中在双击打开的预览浮层里。当前固定项的卡片右上角带一个「当前」徽标。

**卡片信息只有一行**：`标题 · 作者 · 时长 · 分辨率`（`BrowserItemView.infoLine(for:)`）。此前是标题一行、副标题一行，合并之后卡片矮了 15 pt、一屏能多看到一行。信息按「有才显示」拼，缺项就跳过、不编造占位值；`lineBreakMode` 是截尾，`maximumNumberOfLines` 固定 1，**不会折行**（卡片高度就是按一行算的）。

**为什么从单列 `NSTableView` 改成网格**：数据层**没有分页**（一个分类就是一个文件，切片是全量），单列一行一条在 3536 条的风景分类里要滚 3536 行。网格一屏十几张，滚动量降一个数量级。

### 缩略图：必须加 OSS 处理参数

`coverUrl` 指向的是**全尺寸静态图**。实测风景分类 3536 条全是 `.jpg`、单张 **384 KB** —— 一屏 12 张就是 4.6 MB，滚完一个分类 **1.3 GB**，直接加载原图不可行。

该 CDN（阿里云 OSS）支持图片处理查询参数，实测同一张图：

| 请求                                             | 体积     | 尺寸     |
| ------------------------------------------------ | -------- | -------- |
| 原图                                             | 384 KB   | 原尺寸   |
| `?x-oss-process=image/resize,w_360/quality,q_80` | 10.3 KB  | 360×203  |
| `?x-oss-process=image/resize,w_720/quality,q_80` | 39 KB    | 720×405  |

网格档用 `w_360`、浮层预览用 `w_720`（`ThumbnailURL.gridWidth` / `previewWidth`）。**这是对第三方能力的依赖、没有文档保证**，所以不硬编码 host 白名单，取而代之的是**候选链 + 内容类型兜底**：带参数的请求失败、或返回的不是 `image/*`，就退回原图；上游关掉这个能力时的表现是「能显示但变慢变重」，**不会破图**。

地址用**字符串拼接**而不是 `URLComponents` —— 后者会把 `x-oss-process` 值里的 `/` 编码成 `%2F`，而 OSS 对编码后的值行为没有保证。

三条加载约束（`ThumbnailLoader` + `ThumbnailRequestTracker`，纯逻辑部分在 Core）：

- **限并发 4**，超出排队；同一个 key 的重复请求**去重**（挂到等待者上），不会并发拉两遍。
- **失败不自动重试**（记进 `failed` 集合）。滚动时同一张图会被反复经过，自动重试等于对着一批坏地址反复发请求。
- **内存缓存 `NSCache`，上限 96 MB，成本按解码后的字节数算**（`pixelsWide * pixelsHigh * 4`）。**不做磁盘缓存** —— 与「不做本地视频缓存」同一条取舍。

### 双击打开预览

双击某张卡片 → 在网格区上方浮出一块 16:9 的画面，**立刻开始播放**。关闭出口：画面右上角的 ✕、`Esc`、`⌘W`、切分类（切分类会自动关掉），见[关闭方式](#关闭方式--esc-w)。

⚠️ `NSCollectionView` **没有** `doubleAction` / `target`（`NSTableView` 才有），delegate 里也没有双击回调。所以双击是在 `BrowserGridView.mouseDown` 里按 `event.clickCount == 2` 判的，再用 `indexPathForItem(at:)` 反查命中的卡片。**先调 `super.mouseDown`** —— 双击的第一下本来就该先选中那张卡片，于是双击之后「选中项」和「浮层里的条目」是一致的。

面板尺寸 **760 pt 宽**（画面 760×427），窄窗口跟着网格区收、下限 420 —— 预览是「看清这条到底长什么样」的地方，560 太小。

**打开即自动播放，且不可暂停/停止**：没有「停止预览」按钮，左上角也不再显示「加载中… / 播放中 / 静态图」这类状态角标。要停下来就关掉弹窗（关窗走 `teardown()` 释放播放器）。**失败仍然提示**：那不是常态提示而是错误反馈，画面会退回静态图，不给原因看起来就是「点了没反应」。

浮层**只盖网格区**，分类栏照常能点。容器与压暗层都是 `PassThroughView`（`hitTest` 命中自己时返回 nil），于是鼠标事件**穿到下面的网格上**：浮层开着也能继续翻、也能双击换一条预览。少了这层，整个网格区变成死区 —— 想看下一条必须先关浮层再双击，而「翻着挑」正是这个窗口的主要用法。

⚠️ **容器和压暗层两个都必须是 `PassThroughView`，只改容器不够**：`super.hitTest` 会先命中铺满整个区域的压暗层并**返回它**（不是 self），于是事件照样被吃掉。这个坑只有**直接测 `hitTest`** 才会暴露 —— 直接调 `grid.mouseDown(with:)` 是绕过 hit-testing 的，测不出来（我就这么误判过一版）。

播放器现在是**四态**：`idle`（还没起播）/ `loading` / `playing` / `failed`（带原因）。**没有 `cover`**（显示静态图）这一态，也**没有 `stop()`** —— 打开即播、不可暂停/停止，收尾只有 `teardown()` 一个入口（关浮层）。原先的「停止预览 / 预览」开关已移除。

双击是明确的「我要看这一条」所以直接开播 —— 这与「选中即自动播」是两回事：后者会让方向键连翻几条就把每条视频都拉一遍。代价是每次双击都会真拉一次视频流，但那是用户明确要求的。

### 关闭方式：✕ / Esc / ⌘W

三个出口走**同一套层次规则**（`WallpaperBrowserViewController.dismissTopLayer()`）：浮层开着就先收浮层；
浮层没开时 `Esc` 与 `⌘W` 才关窗口。✕ 与「点压暗背景」只收浮层、不动窗口。

⚠️ **⌘W 只能接在 `NSWindow.performKeyEquivalent(with:)` 上，靠 `keyDown` / `cancelOperation` 收不到。**
本 App 是 `LSUIElement`（菜单栏常驻、不占 Dock），**没有 main menu** —— `NSApp.mainMenu` 是 nil，
⌘W 没有菜单项去消费它；而带 Command 的按键事件走的是**快捷键通道**
（`NSApplication` → `NSWindow.performKeyEquivalent`），没人处理时事件被**直接丢弃**（还会响一声），
**不会**再作为 `keyDown` 往下传。这正是「Esc 能用、⌘W 不能用」的原因：Esc 不带 Command，走的是
`cancelOperation`。实现落在 `BrowserWindow`（`NSWindow` 子类，见 `WallpaperBrowserWindowController.swift`），
它只把事件转给内容视图里那唯一一份层次规则，不自己实现规则。

**只认恰好 ⌘ 的组合**：`⇧⌘W`（macOS 上是「关闭所有窗口」）、`⌥⌘W` 一律交回 AppKit —— 本 App 只有一个
窗口，这些组合按下去什么都不做，比误关更符合预期。匹配用 `charactersIgnoringModifiers == "w"` 而不是键码：
菜单快捷键本来就是按**字符**匹配的，非 QWERTY 布局（AZERTY 的 W 在别的位置）也仍然成立。

验证：端到端探针（直接编上述真实源码，不起 App）覆盖 17 条断言 —— ✕ 只收浮层；`Esc` 与 `⌘W` 都是
「先收浮层、再关窗口」；`⇧⌘W` / `⌥⌘W` / 单独按 `w` 都不消费、不动窗口。
**未验证**：`⌘.`（macOS 的取消键）在探针的合成派发下没有触发 `cancelOperation`，但探针没有真实的
key window 事件循环，这个结论不可靠 —— 要确认得真机按一下。

### 「设为桌面壁纸」与固定

按钮放在**画面下方信息行的右端**：叠在画面上会挡住要预览的东西，移到信息行之后画面是完整的。

点下去调 `AppDelegate.setPinned(_:categoryID:)`，与菜单「选片顺序 → 固定」走**同一条落实路径**（见[固定：只播当前这一条](#固定只播当前这一条)）。三条容易忽略的联动：

- **固定项属于别的分类时会同步切换内容过滤**。否则解钉之后的轮换会落在用户早先浏览到的那个分类里，而不是他刚挑的那张所在的分类。
- 固定后按钮变「当前桌面壁纸」并置灰、卡片加「当前」徽标。**窗口里没有取消固定的入口** —— 解钉只走菜单那三处。
- 固定**不会**关掉浮层，视频继续播。

浮层里的条目由 `previewItemID` 单独记，**刻意不与网格选中项挂钩**：浮层只跟着「双击」走。单击别的卡片只移动网格高亮，不该顺手把正在播的那条换掉 —— 否则「挑一张看看」和「翻着找」会互相打断。

### 关窗不影响桌面

关闭窗口会先关掉预览浮层（里面会释放预览播放器），再取消在飞的缩略图请求。**桌面播放不动、不暂停** —— 浏览窗口是「挑一张」的工具，不该把正在看的壁纸弄停。窗口 `isReleasedWhenClosed = false`（controller 持有它，否则关闭后再 `showWindow` 会崩），关闭时 `AppDelegate` 把引用置空，下次打开重新建。

### `.accessory` 下开窗口要自己激活

App 是 `LSUIElement`（不占 Dock），窗口默认会开在别的 App 后面，用户以为点了没反应。所以 `present()` 里**先 `makeKeyAndOrderFront` 再 `NSApp.activate`** —— 顺序反了激活请求会作用在一个还没上屏的窗口上。窗口用**默认 level**（远高于桌面覆盖窗口那一层，不跟壁纸抢层级），也刻意**不切 `.regular` 激活策略**（那会闪出一个 Dock 图标，而窗口里只有列表和按钮、没有文本输入）。

### 已知限制

| 限制                                     | 原因与后果                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 离线时只能浏览当前播放分类               | 浏览走 `CatalogService.loadSlice` 但**绝不写共享切片缓存**（那是播放的离线兜底，只有一份）。离线时其它分类会命中归属校验失败 → 显示「加载失败」。**不会显示错分类**        |
| 浏览别的分类**不改**内容过滤             | 窗口里切分类只换列表数据，不写配置。只有「设为桌面壁纸」时才会同步（见上）                                                                                                 |
| 无分页                                   | 数据层一个分类一个文件、切片即全量，没有分页的概念                                                                                                                         |
| 全部交互**只经探针验证，没有人工点过**   | 见下                                                                                                                                                                       |

### 验证情况

窗口的逻辑用**一次性探针**验过（`swiftc` 直接编译真源码 + 3536 条假数据，**163 行 `PROBE:` 读数全符合预期**）：

- **两栏**：`NSScrollView` 只有 2 个（分类 + 网格）；分类栏 76×660 贴左、网格 984×660 贴右，两栏严丝合缝、都铺满高度；全文搜不到「共 N 条」。
- **卡片单行**：`infoLine` = `风景壁纸 3 4K · 作者3 · 4K`，无换行；**卡片高 − 缩略图高 = 26**（改之前是 40，即两行）。
- **响应式**：默认 1060 pt 下 **4 列**，缩到最小 880 pt 下 **3 列**，网格始终贴右缘。
- **浮层**：初始 `isHiddenOrHasHiddenAncestor == true`；打开后可见、信息行与卡片一致、面板 **760 pt**、画面 **760×427**（宽高比 1.7778）、「设为桌面壁纸」的**父视图是面板**（在信息行右端）、距面板右内边距 **12 pt**、面板在网格区内水平垂直都居中。窄窗口（880）下面板收到 740。
- **点「设为桌面壁纸」**：按钮变「当前桌面壁纸」且禁用，dataSource 收到 id=3，**浮层仍在**（视频继续播）。
- **Esc**：浮层开着时只关浮层，窗口可见性不变。
- **切分类**：浮层自动关闭。
- **双击事件本身**：造了一个真的 `NSEvent`（`clickCount: 2`）直接发给 `mouseDown`，`indexPathForItem(at:)` 命中、浮层打开且信息正确 —— 这条链路此前只能人工点，现在探针也能验了。
- **浮层开着时的交互**（需求点名的一条）：① **单击**别的卡片 → 预览**不跟着换**（仍是 `风景壁纸 1 4K`），浮层仍开；② **双击**另一张 → 预览切到那张（`风景壁纸 6 4K`），浮层仍开；③ 点画面右上角的 **✕** → 浮层关闭。①②正是「压暗层事件穿透」要换来的效果：不穿透的话，①②都无从发生。
- **事件穿透本身**（直接测 `hitTest`）：面板外的点**不在浮层内**、且**落在网格内**（两个都 true）；面板内的点命中浮层内的视图（true）。只有这三个一起成立，「点得到卡片」才是真的。
- **长标题下的对齐**（「各区域对齐一致」）：造了一条 85 字的标题，面板仍是 560、按钮宽 **76**（与短标题时一致）、文字右缘距按钮左缘还有 **10 pt 间隙**（不重叠）、`stringValue` 仍是完整标题（只在显示时截尾）。
- **预览失败态**：`cdn.invalid` 必然失败，等 3 秒后角标显示「资源不可用」、「预览」按钮禁用（不会让人对着坏地址点第二次）。
- **长标题的网格卡片**：信息行仍是 15pt 单行、不折行，底缘不超出卡片；与短标题卡片的 frame **完全一致**（对齐一致）。
- **分类栏**：宽 76、字号 14、行高 28、**列宽 76**（`NSTableColumn` 默认 100，不显式设会溢出栏外，长分类名被滚动视图硬裁而不是在标签内截断成省略号）。造了一个「超长分类名称」实测：文字宽 60 = 76 − 16，未顶破单元格。
- **响应式列数**：1060 → **4 列**、1400 → **5 列**、最小 880 → **3 列**；每次「卡片宽 × 列数 + 间距 + 内缩」与网格宽的差都是 **1 pt**（撑满）。
- **浮层开着时拉伸窗口**：1060 / 1400 → 面板 760（封顶），880 → 740；三档下面板都仍在网格区内、水平居中、画面保持 16:9，且浮层**不会被拉伸关掉**。

另跑了 Core 测试套件全绿（这轮只动 `Sources/LiveWall/`，确认没碰坏基线）。
**项数不写死在这里** —— 会随每次改动漂移；跑 `./test.sh` 看实际值（该脚本同时会做
「测试函数是否都在 `main.swift` 里登记」的自检，漏登记直接失败）。

**死代码扫描**（项目约定）：这轮删掉 `subtitle(for:)` / `didSelectItemsAt` / `didDeselectItemsAt` / `selectedItemID` / `isLoading` 之后，对涉及的文件重扫了一遍 —— 候选只有四个 **AppKit 回调**（`cancelOperation`、`numberOfRows`、`tableViewSelectionDidChange`、`windowWillClose`），不是死代码。顺带清掉两个**自己先前写的**死符号：`PreviewPlayer.showCover()`（函数体与 `stop()` 一字不差、无调用方）与 `PreviewPlayer.isPlaying`（全项目用到的都是 `PlaybackState.isPlaying` / `PlaybackEngine.isPlaying`）。

⚠️ 写这组断言时踩过三个**探针自身的坑**，都曾让断言假阴性/假阳性：

1. **坐标系**：`panel.frame` 是相对浮层的，拿它跟 `gridScroll.frame`（相对 root）比「是否居中」永远不等 —— 必须先 `convert(_:to:)` 到同一个坐标系。
2. **AppKit 是非翻转坐标系**：`frame.minY` 才是「距底」。我一开始写 `bounds.height - frame.maxY`（量的是距顶），于是「按钮距底 12」这条读数出来是 279。
3. **断言必须限定在被测容器内**：上一轮在 `content` 全局范围里找「以『风景壁纸』开头的 `NSTextField`」，而网格卡片的标签本身就是「风景壁纸 N 4K」→「无残留」永远为 true。后来改成**借按钮的 `superview` 反查面板**再收集文本。
4. **量布局要量 `alignmentRect`，不要量 `frame`**：`NSTextField` 的 `frame` 比它的 alignment rect **每边宽 2pt**。拿 frame 去验「2pt 内边距生效没有」会得到「没生效」（实测 frame 宽 186，而 `alignmentRect` 是 182）—— 一个假警报。Auto Layout 用的是 alignment rect。

> 顺带一条 AppKit 语义，容易算反：约束 `A.top = B.bottom + 6` 的含义是「A 的顶边在 B 底边**下方** 6pt」。在非翻转坐标下就是 `A.maxY = B.minY - 6`（实测缩略图 minY=26、信息行 maxY=20）。拿 `minY/maxY` 直接加减会算成反向。

**第一个真的 UI bug**：浮层面板的宽度最初写成 `previewPanel.width == previewOverlay.width - 80`。**Auto Layout 的等式是双向的** —— 它为了满足这条，反过来把网格区压窄了：窗口从 1060 被压到 **778**（778 = 分类 138 + 网格 640，而 640 = 560 + 80），甚至压到了 `minSize` 880 以下。做法是二分定位出来的（注释掉浮层后窗口立刻恢复 1060）。改成**常量宽度约束 + 在 `viewDidLayout` 里按网格区实际宽度夹取**后恢复正常：常量约束只会决定面板自己，不会反向传播。

**第二个真的 bug（也是探针的盲区）**：我一度以为「浮层开着时双击另一张能切换预览」已经验过了 —— 但那是**直接调 `grid.mouseDown(with:)`**，绕过了 hit-testing，穿透到底有没有生效根本没被问到。补一条直接测 `hitTest` 的断言后立刻露馅：面板外的点命中的视图**仍在浮层内**（就是压暗层），网格还是死区。原因是 `PassThroughView.hitTest` 只在 `super.hitTest` 命中**自己**时才返回 nil，而铺满整个区域的压暗层是它的子视图、会先被命中并被返回。**容器和压暗层两个都得穿透**才有用（类也顺势从 `PassThroughOverlay` 改名成 `PassThroughView`）。教训：**验交互不能绕过事件派发** —— 直接调 `mouseDown` 只证明了「这个方法的逻辑对」，没证明「事件到得了这里」。

**第三个真的 bug（长标题把按钮挤没）**：信息行的 `previewInfoLabel` 只有 leading + 与按钮的 `>=` 间距，**没有显式宽度上限**。造一条 85 字的标题实测，「设为桌面壁纸」按钮被压成 **0 宽** —— 两者默认压缩阻力相同，Auto Layout 就去压按钮了。修法是**显式排优先级**：信息行 `.defaultLow`（文字本来就该截尾），按钮 `.required`（按钮没了是功能损失）。修后长标题下按钮仍是 76 宽，与短标题时一致。

**第四个真的 bug（右侧空白 226pt，两个原因叠在一起）**：

1. **浮点边界**：卡片宽按「可用宽度均分」算出来时，整行宽度与可用宽度**正好相等**。实测 1060 窗口下 4×226.75 + 间距 = 943，可用正好 943 → 流式布局只摆了 **3 列**，右边空 226pt（每次都正好少一列）。留 **1pt 余量**就好了。
2. **宽度来源错**：必须用 **clip view** 的宽度，不能用 `collectionView.bounds.width` —— 后者在早期布局轮次里还是整个滚动视图的宽度（984），没扣掉竖向滚动条（真实 967）。
3. **光改宽度来源还不够**：clip 缩窄（984 → 967）之后 collection view 未必会再排一次，`viewDidLayout` 和 clip view 的 bounds 通知实测**一次都没触发**。可靠的是在 `NSCollectionView` 子类里覆写 **`setFrameSize`**（`autoresizingMask = [.width]` 必然走它）。另外 `invalidateLayout()` 不会把 collection view 标成 `needsLayout`，得手动标；并且要显式写回 `itemSize`，只靠 `sizeForItemAt` 会出现「尺寸查询跑了但 frame 还是旧的」。

**顺带修掉的第五个 bug（分类栏收窄带出来的）**：`NSTableColumn` 默认宽 **100pt**，栏宽收到 76 之后列不会自动跟着收 —— 单元格仍是 100 宽，长分类名被滚动视图硬裁，而不是在标签内部截断成省略号。显式设 `column.width/minWidth/maxWidth = categoryWidth` 后正常。

缩略图链路另用**线上真实 `coverUrl`** 跑过一轮：6 条全部拿到、位图尺寸 **360×203**（网格档）/ **720×405**（预览档），二次请求**同步**命中缓存，坏地址两级候选都失败时回调 `nil`（不卡不崩），无 `coverUrl` 时立刻同步回调 `nil`。

**三个探针发现的 AppKit 行为**：

1. `NSCollectionView.selectItems` 程序化选中**不触发** `didSelectItemsAt` delegate；而 `deselectAll(nil)` **会**触发 `didDeselectItemsAt` —— 两者方向相反，上一轮专门用「补调之前先读一次」的办法确认过（补调是幂等的，不这么测就分不清是自动触发还是靠补调兜住的）。
2. `NSCollectionView` **没有** `doubleAction` / `target`（`NSTableView` 才有），delegate 里也没有双击回调 —— 双击只能从 `mouseDown` 的 `clickCount` 判。
3. **刻意不实现 `didSelectItemsAt` / `didDeselectItemsAt`**：这两个回调此前存在的唯一理由是驱动右栏（选中 → 右栏显示它的预览与按钮）。右栏移除之后没有消费者了 —— 网格高亮由 `NSCollectionView` 自己管，预览只认「双击」（`previewItemID`）。留着两个空回调只会让人以为选中态还有别的副作用。既然不再实现，上一条里「先 deselect 再 select」的时序也就无所谓了。

**构建层面另做了四重验证**（探针验的是「代码逻辑对不对」，这四条验的是「新代码真的进了产物」）：

1. **全量 release 构建**：`swift build -c release --disable-sandbox --manifest-cache none`（四个 target 全编）—— `Build complete! (12.26秒)`，**0 error、0 代码 warning**（只有 CLT 环境下必然出现的 ld search path 警告）。这一步补上了一个真实缺口：`LiveWall` target（含 `AppDelegate.swift` 的 13 处改动）耦合太重、进不了 `swiftc` 探针，此前从未被真正编译过。**注意工具层会把这个构建报成 failed** —— 沙箱拦下 `~/.swiftpm/security` 的写入让退出码非零；**以日志里的 `Build complete!` 与产物时间戳为准**。耗时量级本身就是判据：真重编是 12–17 秒，而之前遇到过「报 `Build complete! (0.24秒)` 却没真重编」的幻影构建。
2. **二进制字节扫描**：`.build/release/LiveWall` 里按 UTF-8 搜新代码的字符串，17 个探针中 15 个命中；两处「缺失」（`解除固定：` 15B、`无预览图` 12B）用 debug 二进制做对照确认是 **release 小字符串优化的假阴性**（≤ 15 字节的字面量被内联成立即数，不作为连续字节落在数据段），换成 24 字节的 `用户主动恢复轮换` 后命中。
3. **`#if DEBUG` 隔离仍然有效**：`打印窗口层级表`（21B）、`窗口层级快照`（18B）在 release 里**搜不到**、在 debug 里**搜得到** —— 后半句是关键对照，它排除了「搜索方法本身失效」这种解释。
4. **改动不引入新字面量时，改用 `otool -oV` 查类与方法**。这轮的「两栏 + 双击浮层」复用的全是既有文案（「设为桌面壁纸」「当前桌面壁纸」「停止预览」…），「扫长串」对它天然无效。`otool -oV .build/release/LiveWall` 里能看到 **`BrowserGridView`**（superclass = `NSCollectionView`，带 `mouseDown:` 与 ivar `onDoubleClick`）和 **`PassThroughView`**（superclass = `NSView`，带 `hitTest:`）—— 两个新类都在，说明改动编进了产物。（上一轮用同一招查过 `collectionView:didDeselectItemsAtIndexPaths:`；⚠️ **Swift 合成的选择子带参数名**，按直觉搜 `collectionView:didDeselectItemsAt:` 实测 0 命中 —— 假阴性。）

顺带重新组装了 `build/LiveWall.app`（`./build.sh`，经一个给 `swift` 追加 `--disable-sandbox --manifest-cache none` 的垫片跑通，`Build complete! (11.54秒)`）：`codesign -v` 通过、`Sealed Resources version=2 rules=13 files=7` 与拷进去的文件数一致（图标已封进签名）、`LSUIElement=true`、`CFBundleVersion=1`；包内二进制里 `BrowserGridView` / `PassThroughView` 都还在（各 2 处 —— `strip -x` 只清符号表，ObjC 元数据里的类名清不掉）。

⚠️ **包内二进制比 `.build/release/LiveWall` 小一大截是正常的**：`build.sh` 在 release 下是**先 `strip -x` 再 `codesign`**，它会自己打一行 `[build] 已剥离符号：1643 KB → 970 KB`（约 −40%）。所以两者**不能靠哈希/体积比对**（脚本自报的 970 KB 与落盘实测的 965 KB 还差几 KB，那是 ad-hoc 签名再次改写 Mach-O 造成的）—— 判断「是不是同一份代码」只能靠在包内二进制里找特征串与类名。（早先记的「1601872 vs 1611096，差异来自 codesign」是错的：那次没体现 strip，差异主因是剥离而不是签名。）

> 关于 `swift build` 的一处疑点：开发过程中 `swift build --product LiveWall` 出现过一次「报 `Build complete! (0.24秒)` 却未真正重编」（`touch` 后仍是 0.24 秒，删掉中间产物目录后 `grep` 不到任何输出）。**仍未查清原因**。但加 `--disable-sandbox --manifest-cache none` 之后的构建是**可核实为真实**的：编译耗时 13–17 秒量级（实测 13.41 秒 / 经 `build.sh` 16.63 秒）、产物时间戳随之后移、二进制里能搜到新字符串 —— 三重佐证。改完 `Sources/LiveWall/` 下的代码后，`touch Sources/LiveWall/*.swift` 强制一次再确认产物时间戳，是这次留下的习惯；要确认**代码本身**正确就用上面那套 `swiftc` 探针，它绕开 SwiftPM 的增量缓存。

## 热键、自启、多屏、选片与过滤

### 全局热键

| 组合  | 作用         |
| ----- | ------------ |
| `⌥⌘P` | 暂停 / 继续  |
| `⌥⌘N` | 下一张       |
| `⌥⌘R` | 重新加载内容（线上来源 = 重拉清单，本地来源 = 重扫文件夹） |

用 Carbon 的 `RegisterEventHotKey`，**不需要辅助功能授权** —— `NSEvent.addGlobalMonitorForEvents` 那条路会弹权限窗、还要重启 App 才生效。

代价是全局热键会**抢占**该组合，其它 App 收不到这个按键。所以只挑不常用的 `⌥⌘` 组合，并且**注册失败会显式提示**：重复注册同一组合返回 `eventHotKeyExistsErr`（-9878），据此区分「被占用」与「其它失败」，菜单里单独标出。

> 菜单项**刻意不设 `keyEquivalent`**：那会让菜单打开时全局热键与菜单项各触发一次，切换类操作执行两遍等于互相抵消。

没有 `⌥⌘M 静音`：壁纸被硬性要求静音（`player.isMuted = true`），一个永远无效的开关比没有开关更糟。

### 开机自启

用 `SMAppService.mainApp`（macOS 13+），注册到「系统设置 → 通用 → 登录项」，用户看得见也管得着。刻意不用另外两条路：`LSSharedFileList` 在 macOS 13 起已废弃；往 `~/Library/LaunchAgents` 写 plist 会绕过登录项的用户可见性。

**实测**：App 放在 `~/Coding/.../build/LiveWall.app`（**不在 `/Applications` 下**）也能注册成功，注册后状态变 `enabled`，注销后回到 `notFound`。

注意 `SMAppService.mainApp.status` 在**未注册**时返回的是 `notFound` 而不是 `notRegistered` —— 别被名字骗了。曾据此在菜单里显示「不可用（需在 .app 内运行）」，而功能其实完全可用，属于会让用户放弃使用的假故障。两个「没开启」状态现在统一显示为「未开启」。

### 多屏策略

| 策略                 | 行为                                 | 状态      |
| -------------------- | ------------------------------------ | --------- |
| 全部同片（**默认**） | 所有屏幕同一张，共用一个播放器       | ✅ 已实现 |
| 仅主屏               | 只在主屏播放，其余屏保留系统壁纸     | ✅ 已实现 |
| 每屏独立             | 每块屏各自取片，流量与解码按屏数翻倍 | ✅ 已实现 |

菜单路径：菜单栏 → **多屏策略（当前 xxx）**。切换即时生效，不需要重启。

**槽位**是这套机制的承重概念：一个槽位 = 一路独立解码（`AVQueuePlayer` + `AVPlayerLooper`）。
「全部同片」与「仅主屏」都只用**一个** `.shared` 槽位，所有窗口挂同一个 player —— 多屏
解码同一段视频时共享播放器最省资源。「每屏独立」按屏幕各开一个槽位，主屏与副屏因此
可以是完全不同的两条视频。

槽位用 `displayID` 而不是窗口对象做 key：屏幕热插拔时窗口会被整体重建，
用窗口做 key 会让「这块屏刚才播的是什么」跟着窗口一起丢掉。

**每屏独立不是无限制的**：`MultiScreenPolicy.maxIndependentScreens`（默认 3）封顶，
超出的屏幕并进最后一个槽位共用一路解码，此时日志会写明降级。主屏**永远独占一路**，
不会被并进共用组 —— 否则「主屏」这个概念就没了。

「仅主屏」用 `NSScreen.screens.first` 而不是 `NSScreen.main` —— 后者是「当前键盘焦点所在的屏幕」，会随用户拖窗口漂移，用它会导致窗口建到副屏上。

#### 各屏的源怎么保存与恢复

每屏独立模式下，各屏幕「上次播的是哪一条」记在 `config.json` 的 `perScreenSources`，
键是 `displayID` 的字符串形式，值是**清单条目 id**：

```json
"perScreenSources": { "sources": { "1": 42, "3": 87 } }
```

**存条目 id 而不是 URL**：视频源是远程清单里的条目，CDN 路径带日期目录，会随内容轮换
而变；存 URL 的话多半会指向一个已经 404 的地址，而条目 id 在同一份清单内稳定。

拔掉的屏会在下次保存时被清理（`prune`），记录条数上限 16。

**恢复**发生在**本次启动第一次成功加载清单**时（`advance()` 里消费 `pendingRestore`），
各屏直接接着播记下的那一条。三条约束：

| 约束                                                              | 为什么                                                                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 只在**第一次**加载时恢复                                          | 手动重载清单（`⌥⌘R`）时各屏已经记着当前条目，再恢复一次等于把同一段视频重新下一遍                        |
| 条目**必须在当前分类的切片里**（`ScreenSourceRestore.plan` 过滤） | 用户换过分类、或生成侧重新导出过清单之后，旧条目多半已经不在。查不到就**退回正常取片**，不能让那块屏空着 |
| 恢复计划**取出即清空**                                            | 即使 `advance()` 因暂停/候选池耗尽提前返回，它也不会泄漏到之后某一次定时切换                             |

恢复过的条目会从待取队列里拿掉，所以不会在同一轮里再被取一次。日志里会打出
`待恢复的每屏源 N 条：屏1→…`，这一行就是「恢复有没有生效」的判据；一条都没命中时打
`每屏源记忆里的条目都不在当前分类，本轮各屏重新取片`。

#### 边界情况

- **屏幕热插拔**：槽位**按 key 复用**，没变化的那块屏不会重新拉视频；新出现的槽位才补一张。
- **候选比槽位少**：池里只剩一两条时，后面的槽位复用第一条 —— 宁可几屏同片，也不留一屏黑着。
- **某槽位加载失败**：只影响它自己（保持其画面，下次切换重试）。**只有全部槽位都失败**
  才停全局调度 —— 副屏挂掉不该把主屏也停掉。
- **加载完成时槽位已失效**（屏拔了 / 策略切了）：丢弃结果，不往不存在的槽位里塞内容。
- **上次播的条目已不在当前分类**：各屏退回正常取片（绝不空着），见[各屏的源怎么保存与恢复](#各屏的源怎么保存与恢复)。
- **资源占用**：每多一个槽位就多一路解码与一份流量（实测单屏约 1.9 GB/天），
  这也是「每屏独立」有上限、且默认仍是「全部同片」的原因。

### 壁纸来源（线上 / 本地文件夹）

菜单**设置段**里独立的一项（紧跟「内容过滤」），子菜单两行：`线上（默认）` → `本地文件夹`。
它与选片顺序是**正交**的两件事 —— 来源决定「候选集从哪来」，顺序决定「这一轮怎么排」，
所以「本地 + 随机」这种组合是成立的；混进同一个子菜单就变成四行同级单选，表达不出这个组合。

| 来源            | 候选集                                       | 说明                                       |
| --------------- | -------------------------------------------- | ------------------------------------------ |
| 线上（默认）    | 远端索引 + 当前分类切片                      | 见[内容过滤](#内容过滤)                    |
| 本地文件夹      | 所选文件夹里（**含子文件夹**）的全部 `.mp4`  | 点该行即弹选择面板，选完**当场试扫**一遍    |

本地模式的几条口径：

- **只收 `.mp4`**（扩展名大小写不敏感，`.MP4` 也算），其它文件一律忽略 —— 不是报错，只是不参与播放。
  递归扫完一个 mp4 都没有才算「这个文件夹不能用」，此时**不写配置**、维持原来源并提示原因
  （让用户选了「本地」却因为挑了个空文件夹而静默停在旧来源上，是最难排查的一种表现）。
- **次序按完整路径升序**：顺序模式直接照候选集次序播，次序若随目录枚举顺序漂移，同一个文件夹每次启动的播放序列都不一样。
- **条目 id = 绝对路径的稳定哈希**（FNV-1a 64 位）。失效黑名单与每屏源记忆都按 id 记、且要跨重启生效；
  拿下标当 id 的话，往文件夹里加一个文件就会让后面全部错位（表现成「上次那块屏播的片子变成了另一条」）。
  哈希必须跨进程稳定 —— Swift 的 `Hashable` 每进程随机加盐，不能拿来当持久化 id。
- **本地条目没有静态图**（`coverUrl` 为空）→ 锁屏预览走**抓帧兜底**，与线上缺 `coverUrl` 的条目同一处置。
- **三个「只服务线上内容」的入口在本地模式下全部置灰**：`内容过滤`（本地没有分类可言）、
  `下载当前壁纸`（文件本来就在用户自己的文件夹里，「下载」等于从自己硬盘拷回自己硬盘）、
  `打开动态壁纸`（那个窗口列的是**线上分类的条目**，本地没有可浏览的目录）。
  三者集中在 `WallpaperSourceMenu.OnlineOnlyEntry` 一处登记，判据走 `isEnabled(_:isLocalSource:)`
  —— 新增线上专属入口时来登记，否则它会一直可点而点了没反应。
  已经打开的浏览窗口**不会自动关闭**：它是只读的，不影响桌面播放；要它消失就手动关掉。
- **固定照旧可用**：本地条目地址是 `file://`，固定判定走 `WallpaperItem.playableURL`（接受 http(s) 与 `file://`），
  所以「固定一条本地视频」是合法用法，配置里也不会被启动清洗清掉。
- **文件失效**（被删 / 被移走 / 编码不支持）走既有失败链：`VideoLoader` 对 `file://` **不做 HEAD 探测**
  （本地没有状态码可探），改判文件是否可读；判不出来就归**资源问题**（拉黑换下一条），
  **绝不归网络类** —— 否则失效条目会留在池子里被反复重试。

**文件夹什么时候重扫**：启动时一次，以及菜单里那一项（本地来源下标题为「重新扫描本地文件夹」）/ `⌥⌘R` 一次。
定时切换**刻意不重扫** —— 每个切换间隔都遍历一遍目录，文件夹很大或在外接盘上会有卡顿。
往文件夹里加 / 删 mp4 之后按一次 `⌥⌘R` 即生效。

**文件夹不可用时**（外接盘拔了、文件夹改名了）：配置里的路径**保留**，回退线上清单并在状态区写明原因，
插回来（或按 `⌥⌘R` 重扫）即恢复本地来源。清掉路径的唯一入口是菜单里点「线上」。

> 状态区显示的是**实际在用的来源**，不是配置里的来源：外接盘拔掉后配置仍记着路径，
> 但菜单必须显示「线上」，否则会出现「菜单写着本地、画面里却是线上片单」这种自相矛盾的状态。

### 选片顺序与切换间隔

候选集由「内容过滤」切出（当前分类的那一片），或用「壁纸来源」切成一个本地文件夹，选片顺序决定这一轮里按什么次序取。
子菜单**三行**：随机 → 顺序 → 固定。

| 子菜单行     | 一轮的排列           | 说明                                                                            |
| ------------ | -------------------- | ------------------------------------------------------------------------------- |
| 随机（默认） | 每轮把候选集重新打乱 | 洗牌前排除当前这条，避免刚播完又抽到它                                          |
| 顺序         | 按清单原序循环       | 清单顺序由 `wallpapers export-livewall` 决定，稳定可预期                        |
| 固定         | ——（不再轮换）       | **不是第三种选片顺序**，而是正交于顺序的一层状态，见[固定](#固定只播当前这一条) |

**两条共同性质**（因此「一轮内不重复」两种模式都成立）：一轮的长度等于可用条目数（黑名单除外）；走完一轮才重排，不是「每次随机抽一条、抽到重复就重抽」。

**顺序模式不能沿用「排除当前项」。** 那样每轮都会少一条尾巴，实际播放序列会变成 `A…Z → A…Y → A…X` —— 第二轮不是从清单开头重新开始，看起来像漏播。正确做法是整段原序照排，只在**新一轮的第一条恰好等于当前正在播的那条**时向后让一位（典型场景是刚改了顺序或换了分类，队列被清空重建）。

**切换间隔的单位是秒**，菜单预设 30 秒 / 1 / 2 / 5 / 10 / 30 分钟 / 1 小时，共 7 档：

- 下限 **10 秒** ≈ 一条预览片的时长。再短就是在视频播到一半时切走，解码器反复重建、每张都得重新拉流，纯粹浪费，画面也没来得及看清。
- 上限 **24 小时**。再长等同「几乎不换」，那是「暂停播放」要解决的问题。
- 范围外的值**夹到最近的合法值**而不是退回默认 —— 手改配置的人多半只是「填得太短/太长」，夹紧更接近他的本意；非有限值（NaN / ±∞）夹不了，才退回默认 300 秒。
- 注意 `intervalSeconds` 取 0 或负数**不等于**「播完即切」—— 后者要显式开 `switchWhenFinished`。

实际间隔还会叠加 `jitterRatio`（默认 ±20%）。纯固定间隔会让人形成「什么时候会变」的预期，加抖动更自然。**抖动与合法区间刻意不写进菜单**：子菜单只留 7 档可点的预设，把「为什么不是正好 5 分钟」的解释交给日志（每次切换都会打出生效值）与本节文档 —— 常驻的两行禁用说明在只有 7 个选项的菜单里纯属噪音。

运行时改动怎么生效：

| 改动           | 生效方式                                                                                             | 验证                 |
| -------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| 改自动切换间隔 | 当前这张继续播，**立刻按新间隔重新计时**（作废旧定时器）。否则用户改完盯着看毫无变化，只会以为没点上 | 实测                 |
| 改选片顺序     | **不立刻换片**（当前这张在新条件下依然合法），只清空待取队列 —— 等于重新开始一轮，下一张起按新规则取 | 实测                 |
| 设为桌面壁纸   | **立刻把这一条铺到所有屏**，定时器停排，`pinnedItem` 写进配置；同分类下不重复拉切片                  | 探针验证             |
| 解除固定       | 恢复轮换，按当前 `order` 取下一张；若是「下一张」触发的，解钉提示会在下一条加载成功时补回状态区      | 探针验证             |
| 换内容分类     | **立刻换片**：换分类后原来那条多半已不在候选集里，只清队列不换片的话用户改了设置却看不到任何变化     | 实测                 |
| 任何改动       | 立即写回 `config.json`，重启后保持                                                                   | 实测                 |
| 正在等网络恢复 | 间隔改动**不插队**：那条 60 秒重试有自己的节奏，抢过来会变成「每改一次间隔就立刻重试一次加载」       | 代码存在，未真机触发 |
| 当前处于暂停   | 间隔改动记下，恢复播放后生效                                                                         | 代码存在，未真机触发 |

**固定态下这几行有两处不成立**，因为轮换本身停了：`scheduleNext` 直接返回（不排定时器），`persistScreenSources` 直接返回（每屏源记忆是轮换的产物，固定期间记下来只会在解钉后莫名生效）。而 `advance()` 在固定态下仍会被调用 —— 能走到那里的只剩**恢复类**请求（网络恢复、`holdCurrent` 60 秒重试、`scheduleRecoveryAttempt`），所以那一路用 `force` 重拉而不是短路跳过：槽位里挂着的固定项正是失败的那条，不重拉就永远卡在坏状态上。

黑名单**任何情况下都不清**（除「黑名单覆盖了全部候选」这种整体失效的兜底）—— 那是「资源失效」的记录，与用户选了什么无关。

**实测证据**（同一秒内改间隔，播放项不变）：

```
[15:36:48.721] 下次切换在 28.9 秒后（间隔设置 30 秒，抖动 ±20%）
[15:36:51.825] 切换间隔改为 10 分钟
[15:36:51.826] 下次切换在 696.5 秒后（间隔设置 10 分钟，抖动 ±20%）
[15:36:51.839] 选片顺序改为顺序（按清单原序循环）：候选 2614 条，下一张起按新顺序，本轮重新开始
```

696.5 = 600 × 1.161，抖动落在 ±20% 内；`正在播` 在改动前后是同一张。日志里每次切换都会打出生效值，**这一行就是「改动有没有生效」的判据**。

#### 固定：只播当前这一条

语义：**把当前这一条固定为桌面壁纸，所有屏都播它、不再自动轮换。** 两个入口 —— 菜单「选片顺序 → 固定」、浏览窗口里双击打开预览后叠在画面上的「设为桌面壁纸」按钮（两条走**同一条落实路径** `AppDelegate.setPinned(_:categoryID:)`）。落点是 `Preferences.pinnedItem`（存**整条**，不是 id，理由见[快速开始](#快速开始)的配置说明）。

**为什么「固定」不写成 `PlaybackOrder` 的第三个 case**：`CandidatePool.next()` 完全不读 `order`，`refill()` 里 `order` 的分支是非穷举 `if` —— 加第三个 case 之后 `next()` 照常取片、`refill()` 静默落到「按 source 原序」，**固定根本拦不住**，而三个穷举 switch 还会先编译报错。所以 `PlaybackOrder` 保持 `shuffle` / `sequential` 两值不变，固定由 `AppDelegate` 在候选池**之上**拦截（裁决规则在 `LiveWallCore/PinnedPlayback`，驱动事件是穷举的 —— 新增旁路驱动点必须去那里加 case，这样「漏了一个旁路」会变成编译错误或测试失败，而不是画面被悄悄换走）。副作用是好的：`order` 仍然只有一个含义（解钉后恢复哪个顺序），不需要第三个值。

**「固定」在菜单里是派生显示**，不另存任何布尔量：`pinnedItem != nil` 时勾选落在固定行上，**随机与顺序两行都不勾**（此时画面与 `order` 无关，勾上任何一行都会让人以为「现在播的是这个顺序挑出来的」）；父项标题跟着变成 `选片顺序（固定）`，解钉后自动变回 `选片顺序（随机）` / `选片顺序（顺序）`。「固定」行在**当前没有正在播放的条目**时置灰。

**解钉只有三个触发点**，全部是「用户明确要求换一张」的动作：

| 触发点                         | 结果                                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| 菜单「下一张」/ `⌥⌘N` 热键     | 解钉，并按当前 `order` 正常取下一张                               |
| 选片顺序里点「随机」或「顺序」 | 解钉，并按新选的顺序继续（这两行本身就带解钉语义）                |
| 固定项被判失效（拉黑）         | 自动解钉，状态区给一条 `⚠ 固定项已失效（资源不可用），已恢复轮换` |

只有第三条是**警告级**附注（加 `⚠`），前两条是用户主动动作、画面立刻变了就是回执，不额外提示。解钉警告还有一处时序讲究：`loadAndPlay` 成功时会把 `notice` 重写掉，所以解钉提示先存进 `pendingUnpinNotice`、在成功加载那一刻写回 —— 否则用户看不到「画面为什么突然换了」。

**浏览窗口里刻意没有「取消固定」按钮**：窗口只**标记**当前固定项（卡片右上角「当前」徽标 + 按钮变「当前桌面壁纸」并置灰），解钉统一走菜单那三处 —— 少一个入口就少一种「同一个状态两个地方各改一半」的可能。

**重启后是否仍固定**：看有没有点过「下一张」。固定态是写进 `config.json` 的，重启时 `pinnedItem` 直接读回来 —— **定位它完全不依赖切片**（这正是「存整条而非 id」换来的：只存 id 就得等切片到手才能按 id 找到它，而切分类不解钉，重启时 `selectedCategoryID` 已经换成别的分类、切片里根本没有这个 id，固定就被丢掉了）。解钉时把 `pinnedItem` 清成 `null`，重启自然回到轮换。

**但「能定位」不等于「一定能开播」**：启动时槽位的铺满发生在 `applySliceResult` 里（与轮换共用同一条启动路径），所以**索引或切片都取不到时固定项也不会开播**。那种情况下轮换模式同样播不了任何东西（也是「没有可用的内容」），两者表现一致 —— 不存在「固定特有的黑屏」。离线但本地副本还在时不受影响（索引与切片各自回退副本）。

固定态下**所有屏**都铺同一条（`applyPinToMissingSlots`，幂等）：启动首次铺满、新增槽位（屏幕热插拔 / 多屏策略切换 / 唤醒重建）、空引擎恢复、落实固定，四种场景共用同一个函数。定时器在固定态下**不排**（`scheduleNext` 直接返回并记日志）。

判据是日志里的这几行：`设为桌面壁纸：<id> <标题>`、`固定模式：不安排下一次切换`、`解除固定：…`。

### 内容过滤

按**一级分类**过滤（单选）。菜单路径：菜单栏 → **内容过滤（xxx）**。

清单是**两个文件**，各自独立降级：

| 文件                                   | 内容                                        | 大小           | 何时拉            |
| -------------------------------------- | ------------------------------------------- | -------------- | ----------------- |
| `livewall/catalog.json`                | **索引**：分类清单 + 默认分类，**不含条目** | 901 B          | 启动必拉          |
| `livewall/category.<一级分类 id>.json` | 该分类的条目切片                            | 50 KB – 815 KB | 启动 + 每次切分类 |

启动 = 索引 + 当前分类那一份 ≈ **0.63 MB**（此前是「一次下全量」的 4.9 MB）。
切分类要多一次请求，换来的是启动不必下全量。

| 项               | 做法                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 分类清单         | 索引里的 `categories`，**含条目数为 0 的分类** —— 菜单要显示它并**置灰**，让「哪些分类还没抓全」一眼可见。可点会进空池，表现成「点了没反应」 |
| 菜单显示         | **只显示分类名**，不显示条目数。`itemCount` 仍然参与判定（0 条置灰），只是不显示                                                             |
| 默认分类         | `selectedCategoryID`（记忆值，须存在于 `categories`）→ `defaultCategoryId` → `categories` 首项                                               |
| 记忆             | 存 `selectedCategoryID`，写回 `config.json`，下次启动自动恢复                                                                                |
| 记忆值失效       | id 不在 `categories` 里（分类被改名/删库）→ 回退默认分类，**并立刻写回**，否则每次启动都要重复回退一次                                       |
| 首次启动         | 用默认分类，并立刻写回，让勾选稳定                                                                                                           |
| 切换             | 异步拉那一份切片，成功后**立刻换片**（见下）                                                                                                 |
| 没有「清除过滤」 | 分类恒有选中项，不存在「不限」态                                                                                                             |

菜单里那几行（只显示名字、0 条置灰、单选勾选）由 `LiveWallCore/CategoryMenu` 算好再贴成 `NSMenu` —— 它是纯逻辑，`CategoryTests` 里有对应断言，不必靠肉眼验菜单。

**「不显示条目数」这条现在管全局。** 菜单只显示分类名；浏览窗口左栏同样只显示分类名（0 条的分类用 35% 透明度 + `shouldSelectRow` 返回 false 双重置灰）。原先窗口底部那条 `<分类名> · 共 N 条` **已经移除** —— 条目数在网格里一眼看得到，为它单占一行不划算。（顺带少维护一个「加载中 / 加载完」的两态：那个数字原本取 `items.count`，加载中显示「正在加载…」。）

浏览窗口里切分类**只换列表数据，不写配置**（`selectedCategoryID` 的含义是「池子里装的是哪个分类」，浏览不是播放）。只有点「设为桌面壁纸」时才会同步内容过滤，且仅在该条目属于别的分类时。

#### 切分类是异步的，要处理两件事

| 问题     | 做法                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------- |
| **连点** | 递增的请求序号，回包时比对，过期结果丢弃 —— 否则会出现「点了 B，画面却停在 A」                 |
| **失败** | 保持当前画面**与当前勾选**：选中项只在拉取成功后才写回配置，否则菜单的勾选会和池子里的内容打架 |

选中项 `selectedCategoryID` 的含义是「**池子里装的是哪个分类**」，不是「用户点了哪个」——
这正是失败时两者不打架的原因。

#### 缓存与离线

| 文件                              | 内容                                 |
| --------------------------------- | ------------------------------------ |
| `catalog.remote-cache.index.json` | 索引副本                             |
| `catalog.remote-cache.slice.json` | **一份**切片副本（不是每个分类一份） |

切片缓存只有一份是够的：配置里记的 `selectedCategoryID` 就是「上次成功加载的那个分类」，
所以启动时读回来的那一份必然对得上。另外加载时**会校验切片的分类归属**
（`source.categoryIds` 必须含被请求的 id）—— 换过分类之后离线启动，
不会把上一个分类的内容当成目标分类。

启动时会清掉两个废弃缓存：`catalog.remote-cache.json`（最早的 `livewall.json` 时代）
与 `catalog.remote-cache.catalog.json`（上一版的 4.9 MB 总文件）。

#### 安全：分类文件名来自远端，不能照着它发请求

索引是远端数据。`LivewallCategoryEntry.resolvedFileURL(relativeTo:)` 只接受
**一个纯文件名**：不含路径分隔符、不含 `:`、不是 `.` / `..`、且必须以 `.json` 结尾，
解析完再校验 host 与 scheme 与索引一致。否则远端可以靠改一个字段把客户端的请求
指到任意地址去（`../../`、`https://evil.test/x.json` 之类）。

**为什么不是作者/标签**：分类是数据源里唯一「既有一级结构、又 100% 非空」的维度。标签在采集侧根本没有：`desktop + dynamic` 的候选里带 tag 的是 **0 条**，全库的 tag 只挂在桌面**静态**壁纸与手机端壁纸上。作者虽然非空（50 个），但它是**平铺**的 —— 用户面对 50 个作者名无法判断该选谁，而 10 个分类名是自解释的。作者过滤已随本次改造移除（`CandidateFilter` 一并删除）。

切换分类会清空待取队列（等于重新开始一轮）但**不清黑名单** —— 那是「资源失效」的记录，与用户选了哪个分类无关。

### 窗口 bounds 稳定等待（一个既有 bug 的修复）

`waitForWindowsToAppear()` 原先只等「窗口号出现在 WindowServer 列表里」。但**窗口上屏时有一段对称缩放的进入动画**：实测 1512×982 的窗口在动画期间会被报成 `9,6 1494x970`、`5,3 1502x976`（两次采样值不同，说明是动画而不是真实 frame）。动画没结束就跑 `evaluate`，会得到「未覆盖整屏」并触发一连串无意义的降级。

现在改为等到 **WindowServer 报的 bounds 与屏幕一致**才返回。比较时**不能用 `NSWindow.frame`** —— 它用「原点在主屏左下」的坐标系，副屏上两者会差一个主屏高度（实测同一窗口 `NSWindow.frame.y = -98` 而 `CGWindowBounds.y = 0`）。所以 `ScreenCoordinator` 单独记了一份「期望覆盖区域」，用 `CGDisplayBounds` 的坐标系。

这个 bug 一直存在于「屏幕变化 / 唤醒后重建窗口」路径上，只是之前没人验证过运行期的 frame 正确性。

## 路线图

| 阶段         | 内容                                                                          | 状态      |
| ------------ | ----------------------------------------------------------------------------- | --------- |
| **步骤 0**   | 构建体系升级：SwiftPM + 目录重组 + 测试运行器                                 | ✅ 已完成 |
| **步骤 0.5** | 仓库文档同步（根 `README.md` / `AGENTS.md`）                                  | ✅ 已完成 |
| **P1**       | 清单导出与拉取 + 候选池 + 切换调度                                            | ✅ 已完成 |
| **P2**       | 流量测量 + 失败处理（CDN 失效 / 断网 / 解码失败）                             | ✅ 已完成 |
| **P3**       | 省电 Governor + 遮挡检测修正 + 设置界面                                       | ✅ 已完成 |
| **P4**       | 热键、开机自启、多屏策略、内容过滤                                            | ✅ 已完成 |
| **P5**       | 内容过滤改为按一级分类（1 + N 清单、记忆选择）                                | ✅ 已完成 |
| **P6**       | 每屏源的恢复：`perScreenSources` 从只写变成真的读回                           | ✅ 已完成 |
| **P7**       | 清单改为「索引 + 按分类拉切片」：启动流量 4.9 MB → 0.63 MB                    | ✅ 已完成 |
| **P8**       | 锁屏预览（静态图同步）+ 下载当前壁纸                                          | ✅ 已完成 |
| **P9**       | 状态项常驻（不可移除、提供退出项）+ 状态区显示进程自身 CPU / 内存（惰性采样） | ✅ 已完成 |
| **P10**      | 动态壁纸浏览窗口（本项目第一个普通 UI 窗口）+「固定」状态（只播这一条）       | ✅ 已完成 |

**P1 的实际能力**：读取清单（远程 `https://studio.meowv.com/data/livewall/` 下的索引与分类切片优先，失败各自回退本地副本）、按一轮不重复的洗牌队列选片、按 5 分钟 ±20% 抖动切换、多屏每屏一个覆盖窗口、启动时做层级自检并在不合格时降级。

**P2 的实际能力**：播放前 HEAD 探测拿 HTTP 状态码；失败按 `FailurePolicy` 分四路处理 —— 资源失效（403/404/4xx）直接拉黑换下一条、网络临时故障（超时/DNS）重试一次、**网络不可达时保持当前画面不动且绝不拉黑**、连续 3 次失败停止调度。网络恢复时立刻重试，不等定时器。

**关于缓存：实测后决定不做。** 详见「关键发现 11」——`AVPlayerLooper` 一次下载后就不再产生流量，而洗牌模式下 2,600 条候选每条约 9 天才轮到一次，LRU 缓存永远命中不了，纯属浪费磁盘。断网兜底也不需要它：当前视频已被 AVFoundation 缓冲，继续循环即可。这正好符合项目定位里的「本地不做大量视频存储，仅在必要时做轻缓存」。

**P2 已知未做**：失效黑名单只存在内存里，重启后重新尝试（考虑到 CDN 可能恢复，这是有意的）。

**P3 的实际能力**：省电从两路（显示器休眠、锁屏）扩到八路，新增遮挡、热压力、空闲、低电量模式、电池供电；遮挡检测从「union + bounding box」换成**坐标压缩法精确面积**（修掉两个半屏窗口被误判成完全遮挡的 bug）；省电开关与空闲阈值可在菜单里实时切换并写回配置。详见[省电策略](#省电策略)。

**P3 已知未做**：暂停时不释放播放器（有意，理由见上）；`pauseOnBattery` 默认关闭 —— 插拔电源就暂停会让画面频繁抖动，需要的人自己开。

**P4 的实际能力**：三个全局热键（`⌥⌘P` / `⌥⌘N` / `⌥⌘R`，零权限，被占用时显式提示）；开机自启开关（`SMAppService`）；多屏策略「全部同片」与「仅主屏」；内容过滤（当时按作者，已在 P5 换成按分类）；选片顺序（随机 / 顺序）与自动切换间隔（7 档预设，范围 10 秒 – 24 小时）可在菜单里实时切换并写回配置，见[选片顺序与切换间隔](#选片顺序与切换间隔)。顺带修掉一个既有 bug：窗口上屏的进入动画会让 bounds 在动画期间内缩，导致「未覆盖整屏」误判。

**P4 已知未做**：热键组合固定，不可配置。

**P5 的实际能力**：内容过滤从「按作者多选」换成「按一级分类单选」。清单从单文件改为 `livewall/` 目录下的多个文件；选中的分类存进 `config.json` 的 `selectedCategoryID`，下次启动自动恢复，记忆值失效时回退默认分类并写回。顺带删掉了 `CandidateFilter` 与候选池里的过滤维度（候选集由调用方切好再灌入），并修掉一处隐患：`reloadCatalog` 原先会先把候选池清空再加载，重载失败会让下一次切换撞上「候选池已耗尽」，现在改成加载成功后才替换。

> P5 当时是「总文件带全量条目、切分类在本地筛（零请求）」。**这一点已被 P7 取代** —— 总文件太大了，现在是「索引 + 按分类拉切片」。

**P5 已知未做**：~~切片客户端不使用、总文件 4.9 MB~~ —— 两条都已在 **P7** 解决。

**P7 的实际能力**：清单从「一个总文件装全量」改成「索引 + 按分类拉切片」。索引 `catalog.json` 只有 901 字节（分类清单 + 默认分类，**不含条目**），条目按 `category.<一级分类 id>.json` 单独拉并各自缓存。启动流量从 4.9 MB 降到约 0.63 MB；切分类多一次请求（异步，带请求序号丢弃过期结果、失败保持当前画面与当前勾选）。菜单不再显示每个分类的条目数。顺带补了两处：分类文件名来自远端，`resolvedFileURL` 只接受纯文件名并校验同源；加载失败时把**原因**一并带出来（此前只有一句「都不可用」）。

**P7 已知未做**：切片缓存只有一份（靠 `selectedCategoryID` 必然对得上 + 归属校验兜底），没做「每个分类各缓存一份」——那会让 Application Support 随访问过的分类数增长。

**P6 的实际能力**：`perScreenSources` 从「只写不读」补成真的读回 —— 每屏独立模式下，本次启动第一次成功加载清单时各屏接着播上次那一条（`ScreenSourceRestore.plan` 过滤掉已不在当前分类切片里的记录，查不到就退回正常取片）。顺带给 `CandidatePool` 加了 `restore(id:)`：直接点名取回一条，并把它从待取队列里拿掉，避免同一轮里再被取一次。详见[各屏的源怎么保存与恢复](#各屏的源怎么保存与恢复)。

**P8 的实际能力**：**锁屏预览** —— 把当前壁纸的静态图同步成系统墙纸，锁屏界面看到的就是当前这张（原理、回退链与写入策略见[锁屏预览](#锁屏预览)）。配套改动：清单新增 `coverUrl` 字段（导出侧同步改，**`schemaVersion` 保持 1**，老客户端忽略未知键即可）；抓帧兜底用 `AVPlayerItemVideoOutput`，**必须挂 `player.currentItem`**；退出时把当前这张的静态图固化成系统墙纸。另加**下载当前壁纸**（维护段菜单项，视频 + 静态预览图 → `~/Downloads/livewall/`，命名规则见[下载当前壁纸](#下载当前壁纸)）。

**P8 已知未做 / 待人工验收**：

- 「锁屏界面确实显示这张静态图」需要**人眼锁一次屏**确认 —— `desktopImageURL(for:)` 读回一致只能证明设置生效。
- 「关闭锁屏预览 → 恢复原墙纸」已真机验证（见[锁屏预览](#锁屏预览)）。**退出时改成固化当前这张的静态图**（`freezeCurrent`），走 `shutdown()`，由 `pkill -x LiveWall`（SIGTERM）或系统终止触发 —— **已真机验证**（2026-09-20，见[锁屏预览](#锁屏预览)的实测日志）。`kill -9` 强杀仍然固化不了，桌面会停在上一张静态图。
- 下载目录固定 `~/Downloads/livewall/`，未做可配置。
- 线上清单需要重新部署一次才会带上 `coverUrl`；在那之前客户端会走抓帧兜底（功能正常，只是画质与「官方静态图」不同）。

**P9 的实际能力**：状态项**常驻** —— `behavior = []`（既不允许被 ⌘ 拖走，也不因移除而终止进程），菜单底部提供「退出动态壁纸」，点击后与 `pkill -x LiveWall`（SIGTERM → `shutdown()`）及系统终止共用同一条清理路径，含固化当前这张的静态图。状态区新增**常驻一行**显示本进程自己的 CPU 与内存（`内存 128 MB · CPU 2.3%（近 3 分钟）`），**只在菜单展开时采样一次**、收起即取消（零定时器、零后台轮询），详见[进程自身占用](#进程自身占用cpu--内存)。

**P9 已知未做 / 待人工验收**：

- 「⌘ 拖动确实拖不走状态项」需要人工试一次 —— `behavior = []` 是按文档语义设的，本机没有实测。
- 采样链路已用探针在真机上跑过三轮（见[进程自身占用](#进程自身占用cpu--内存)），**但那是直接调回调，不是真的点开菜单**。人工点开菜单看那一行在展开瞬间是否刷新（尤其是 CPU 行的区间标注）仍未做 —— 而且**这条只能人工验**：从 shell 启动的进程 `NSApp.isActive` 恒为 false，`performClick` 与 `NSMenu.popUp` 都静默失败（不报错、不展开），沙箱内外一致。
- CPU 与内存的**绝对值**没有跟活动监视器逐项对账（只做了「分配 80 MB → 读数从 1.9 MB 变 82 MB」与「烧 1 秒 CPU → 读数 ≈ 0.98 秒」两个量级校验）。

**P10 的实际能力**：**动态壁纸浏览窗口** —— 维护段的「打开动态壁纸」打开一个**两栏**窗口（分类 / 条目网格），可按分类翻看、**双击打开视频预览浮层**（「设为桌面壁纸」按钮叠在预览画面里）、一键设为桌面壁纸，详见[动态壁纸浏览窗口](#动态壁纸浏览窗口)。配套的**固定**状态进了「选片顺序」子菜单（三行：随机 / 顺序 / 固定），语义是「只播这一条、所有屏都不再轮换」，落点是 `config.json` 的 `pinnedItem`（存整条而非 id），解钉只有三个触发点，详见[固定：只播当前这一条](#固定只播当前这一条)。

**这一版明确打破了「不做 App 内普通 UI 窗口」的既有取舍。** 那条取舍从 P1 起就在，理由（要在 `LSUIElement` 下自己处理激活、焦点与关闭行为）在 P10 被正面解决：`present()` 先 `makeKeyAndOrderFront` 再 `NSApp.activate`，窗口用默认 level、不切 `.regular`、关窗不退出。[`AGENTS.md`](./AGENTS.md) 里那条「赞助不做 App 内弹窗」的结论保留，但理由换成了维护面（二维码是运营素材，内置就得发版才能改）。

**顺带修掉一个隐患**：`notice`（状态区附注）会被 `advance()` / `loadAndPlay` 冲掉。固定态下 `advance()` 被拦截所以不执行清空，但解钉提示需要「画面已经换了」之后仍然可见 —— 于是加了 `pendingUnpinNotice` 在 `loadAndPlay` 成功时写回。落实回执同理用 `pendingPinAnnouncement` 延迟到铺满成功后发，否则会被 `applySliceResult` 里的 `notice = nil` 冲掉，状态区会永远挂着「正在设为桌面壁纸…」。

**构建验证**：全量 release 构建 0 error / 0 代码 warning，二进制字节扫描确认新代码已编入且 `#if DEBUG` 隔离有效，新类 `BrowserGridView` / `PassThroughView` 用 `otool -oV` 单独确认（这轮没引入新字面量，扫长串对它无效），`build/LiveWall.app` 重新组装并签名通过 —— 四条一起补上了「`LiveWall` target 此前只经 `swiftc` 探针、从未被真正编译过」的缺口。详见[动态壁纸浏览窗口](#动态壁纸浏览窗口)的「验证情况」。

**P10 已知未做 / 待人工验收**：

- **浏览窗口的交互仍只经探针验证，没有人工点过一次**（见[动态壁纸浏览窗口](#动态壁纸浏览窗口)的「验证情况」）。这轮把「双击」也纳入了探针（造真的 `NSEvent` 发给 `mouseDown`），但**真机点击的手感**和**预览播放的实际观感**仍未验。
- **`didSelectItemsAt` / `didDeselectItemsAt` 在这一轮被删掉了**：它们此前存在的唯一理由是驱动右栏（选中 → 右栏显示它的预览与按钮），右栏移除后没有消费者。上一轮补的那个「取消选中后右栏不回空态」的缺口随之不再存在（没有右栏了）。
- 「设为桌面壁纸 → 所有屏都换成这一条」在真机多屏上没验过（探针是单槽位）。
- 「关窗不影响桌面播放」「单窗口复用（点两次只前置一个窗口）」没人工验。
- 离线时只能浏览当前播放分类（共享切片缓存只有一份，且归属校验会拦住别的分类）。**不会显示错分类**，只是别的分类显示「加载失败」。
- 启动时固定项的铺满挂在「切片加载成功」之后（与轮换共用同一条启动路径），所以**索引与切片都取不到时固定项也不会开播**。轮换模式在同样条件下同样播不了任何东西，不存在「固定特有的黑屏」；离线但本地副本还在时不受影响。
- `swift build` 增量缓存有未查清的疑点（报 `Build complete!` 却未真正重编），见[动态壁纸浏览窗口](#动态壁纸浏览窗口)末尾。

## 技术栈约定

- 原生 Swift + AppKit + AVFoundation，**不用 Electron / Tauri** —— `NSWindow.level` 与 `collectionBehavior` 的精确控制是本方案成败所在。
- 用 SwiftPM 组织代码，编译只需要 Command Line Tools，不需要 Xcode。
- 不引入第三方依赖。
- 纯逻辑一律放 `LiveWallCore`，保持可脱离 GUI 单测。
- 构建与运行可直接走本目录的 `build.sh` / `test.sh` / `run.sh` / `make-dmg.sh`，也可从仓库根目录执行 `./build.sh livewall` / `./run.sh livewall`。根目录脚本会把 App 汇总到 `build/livewall/`，但 `deploy.sh` 不上传该目录。注意本目录的 `run.sh` 与根目录的 `run.sh` 是同名不同物，前者负责 livewall 自己的 debug/release 构建与运行。
