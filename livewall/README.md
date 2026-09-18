# livewall

macOS 视频动态壁纸工具。**个人自用 / 小范围共享**定位，不面向大规模公开发布。

## 名称与用途

| 项 | 说明 |
| --- | --- |
| 名称 | `livewall` —— live wallpaper 的缩写。目录、Swift 模块、脚本一律用此名 |
| 界面显示名 | 「动态壁纸」—— 菜单栏标题与系统里显示的应用名（`CFBundleName` / `CFBundleDisplayName`）。**只影响用户可见文案，代码与路径仍是 `livewall`** |
| 用途 | 把一段 mp4 放到 macOS 桌面层循环播放，替代静态壁纸 |
| 平台 | 仅 macOS（本机实测 macOS 27.0 / arm64，见[本机实测基线](#本机实测基线macos-270--arm64--双屏)） |
| 内容 | 仅视频壁纸（mp4），不做静态图片、不做网页/WebGL 壁纸 |
| 数据源 | CDN 上的 https 直链，本地不建视频库 |
| 与 `wallpapers/` 的区别 | `wallpapers/` 是 Python 采集器（抓元数据进 SQLite）；`livewall` 是客户端播放器。两者无代码依赖 |

**刻意不做的事**（定位决定的）：用户系统、后端服务、多租户、权限体系、运营审核、埋点统计。唯一需要的"服务端"是一个静态 JSON 清单 + 一堆 mp4 文件。

## 当前状态

这个 App 可以日常使用：清单拉取 + 选片（随机 / 顺序，都是一轮内不重复）+ 可调切换间隔（默认 5 分钟 ±20% 抖动）+ HEAD 探测与四路失败处理，一套**信号 → 状态**的省电状态机（遮挡 / 锁屏 / 息屏 / 热压力 / 空闲 / 低电量 / 电池 + 手动暂停），三个免授权的全局热键，开机自启开关，多屏策略（全部同片 / 仅主屏），以及按作者的内容过滤。菜单里能实时改的东西都不需要重启。

**未完成**：多屏的「每屏独立」策略需要架构级改造（多播放槽位），见[多屏策略](#多屏策略)。

## 目录结构

```
livewall/
├─ Package.swift                SwiftPM 清单，三个 target（见下）
├─ README.md                    本文件：项目定位、结构、快速开始
├─ build.sh                     编译并组装 .app（默认 release = 发布版）
├─ test.sh                      运行 LiveWallCore 单元测试
├─ run.sh                       以 debug 配置编译并启动（开发；--release 走发布版）
├─ Resources/
│  ├─ Info-LiveWall.plist   App 的 Info.plist（bundle id com.meowv.livewall）
│  ├─ AppIcon.icns              App 图标（Finder 用），由 AppIcon-source.png 生成
│  ├─ AppIcon-source.png        图标源图（1024×1024），唯一需要替换的文件
│  └─ MenuBarIcon*.png          菜单栏状态项图标（播放态 / 暂停态，各 1x/2x/3x）
├─ Sources/
│  ├─ LiveWallCore/     纯逻辑库，不依赖 NSApplication，可脱离 GUI 单测
│  │  ├─ LevelPreset.swift      层级预设与有效区间（值全部由 CGWindowLevelForKey 派生）
│  │  ├─ TextLayout.swift       终端显示宽度对齐（中文占两列）
│  │  ├─ CatalogModel.swift     清单的 Codable 结构 + 解析/清洗
│  │  ├─ CatalogService.swift   清单降级链（远程 → 远程副本 → 内置）
│  │  ├─ CandidatePool.swift    候选队列，一轮内不重复 + 失效黑名单；选片顺序（随机 / 顺序）
│  │  ├─ SchedulePolicy.swift   切换间隔与抖动；SwitchInterval 提供预设、合法区间与夹紧
│  │  ├─ DurationText.swift     时长文案（秒 / 分钟 / 小时），空闲阈值与切换间隔共用
│  │  ├─ LogRotation.swift      日志轮转阈值与判定（清空复用同一文件，不留历史文件）
│  │  ├─ FailurePolicy.swift    失败分类与处理决策（拉黑 / 重试 / 保持画面 / 停止）
│  │  ├─ VideoLoadError.swift   加载失败原因（含 HTTP 状态码）
│  │  ├─ PlaybackState.swift    省电信号、状态与判定纯函数 + 空闲阈值文案
│  │  ├─ CoverageGrid.swift     遮挡覆盖率（坐标压缩法，精确面积）
│  │  ├─ MultiScreenPolicy.swift 多屏策略与目标屏选择
│  │  ├─ CandidateFilter.swift  内容过滤（作者/标签）与选项统计
│  │  ├─ Preferences.swift      配置模型与读写（逐字段容错解码）
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
│     ├─ PlaybackEngine.swift   AVQueuePlayer + AVPlayerLooper
│     ├─ VideoLoader.swift      HEAD 探测 + AVAsset 准入校验与时长探测
│     └─ NetworkMonitor.swift   NWPathMonitor 网络可达性
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

| | App 图标 | 菜单栏状态项图标 |
| --- | --- | --- |
| 文件 | `Resources/AppIcon.icns` | `Resources/MenuBarIcon*.png` |
| 可见位置 | Finder / 访达信息面板 | 菜单栏（日常唯一可见处） |
| 声明方式 | `Info.plist` 的 `CFBundleIconFile` | 无声明，代码按文件名加载 |
| 分辨率 | icns 内含 10 档（16→1024） | 18pt 逻辑尺寸，1x/2x/3x 三档 |
| 状态区分 | 无 | 播放态四色风车 / 暂停态同形状统一中灰 |

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

替换 App 图标只需换 `Resources/AppIcon-source.png`（1024×1024），再重新生成 icns：

```bash
cd livewall

# 1) 源图直接铺满 1024 画布。圆角与底板由系统绘制，自己加会让图标出现双层边框
#    （macOS 会为 App 图标统一加圆角玻璃底板，系统 App 也是这个样式）
/usr/bin/python3 -c "
from PIL import Image
Image.open('Resources/AppIcon-source.png').convert('RGB').resize((1024,1024), Image.LANCZOS).save('/tmp/m1024.png')"

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
# 清单由 App 自己从 https://studio.meowv.com/data/livewall.json 拉取，
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

# 退出：菜单栏图标 → 退出，或 pkill -x LiveWall
# 日志：~/Library/Logs/com.meowv.livewall/livewall.log（达 2 MB 自动清空复用，不生成历史文件）

# ── 测试 ────────────────────────────────────────────
./test.sh
```

配置放在 `~/Library/Application Support/com.meowv.livewall/`：

| 文件 | 说明 |
| --- | --- |
| `config.json` | 配置。不存在时用默认值；坏了也不影响启动（回退默认） |
| `catalog.remote-cache.json` | 上次成功拉取的线上清单副本，断网时兜底 |

`config.json` 的字段（全部可省略；**缺字段用默认值，不会因为少一个键而整体解码失败**）：

```json
{
  "remoteCatalogURL": "https://studio.meowv.com/data/livewall.json",
  "intervalSeconds": 300,
  "jitterRatio": 0.2,
  "switchWhenFinished": false,
  "playbackOrder": "shuffle",
  "gravity": "fill",
  "levelPreset": "desktopWindow",
  "multiScreenPolicy": "mirror",
  "authorFilter": [],
  "pauseWhenCovered": true,
  "pauseWhenIdle": true,
  "idleThresholdSeconds": 300,
  "pauseOnLowPowerMode": true,
  "pauseOnBattery": false,
  "pauseOnThermalPressure": true
}
```

`remoteCatalogURL` 是唯一的清单数据源，默认就是线上地址；改成别的 https 地址即可换源，
清空则只剩远程副本与内置兜底条目。旧配置里的 `catalogPath` 会被忽略（本地清单这一层已移除）。
`intervalSeconds` 是切换间隔（单位秒，默认 300 = 5 分钟），`jitterRatio` 是抖动比例；
`switchWhenFinished` 与 `playbackOrder` 见[选片顺序与切换间隔](#选片顺序与切换间隔)。
`multiScreenPolicy` 见[多屏策略](#多屏策略)，`authorFilter` 见[内容过滤](#内容过滤)。
末尾六项是省电开关，语义见[省电策略](#省电策略)。

运行时菜单栏会出现 `◉`/`◐`，可在其中下一张、暂停、**切换选片顺序与自动切换间隔**、切换窗口层级与多屏策略、**逐项开关省电策略**、**按作者过滤内容**、**开关开机自启**、重新加载清单。开发构建（debug）额外多一项**打印窗口层级表**（把当前窗口层级快照打到终端，仅排障用，见[快速开始](#快速开始)）。

## 本机实测基线（macOS 27.0 / arm64 / 双屏）

```
CGWindowLevelForKey(.desktopWindow)     = -2147483623
CGWindowLevelForKey(.desktopIconWindow) = -2147483603
系统壁纸进程「墙纸」实际占用             = -2147483625
```

有效层级区间（左开右开）：**(-2147483625, -2147483603)**，共 21 层可选。

层级标定实测结果：

| 预设 | 层级 | 在壁纸之上 | 在图标之下 | 同层竞争 | 结论 |
| --- | ---: | :---: | :---: | :---: | --- |
| `desktopWindow` | -2147483623 | 是 | 是 | 0 | ✅ **推荐基线** |
| `desktopWindowPlus1` | -2147483622 | 是 | 是 | **1（`WindowManager`）** | ⚠️ 与系统进程同层，见下 |
| `desktopWindowPlus2` | -2147483621 | 是 | 是 | 0 | ✅ |
| `iconMinus2` | -2147483605 | 是 | 是 | 未复测 | ✅ |
| `iconMinus1` | -2147483604 | 是 | 是 | 未复测 | ✅ |
| `iconAboveGap1` | -2147483602 | 是 | **否** | 未复测 | 覆盖桌面图标（"专注模式"用） |
| `iconAboveGap2` | -2147483601 | 是 | **否** | 未复测 | 覆盖桌面图标（"专注模式"用） |

### 区间内的实际占用者（macOS 27.0 实测）

「21 层可选」是理论上限，实际有系统进程常驻。按层级自低向高（实测窗口列表）：

| 层级 | 占用者 | 说明 |
| ---: | --- | --- |
| -2147483626 | `Window Server` | 系统壁纸之下 |
| -2147483625 | 墙纸 | 系统壁纸本身，区间的**下界** |
| -2147483624 | `WindowManager` | 双屏各一个整屏窗口 |
| **-2147483623** | **本程序覆盖窗口** | 无竞争 |
| -2147483622 | `WindowManager` | 整屏窗口（仅主屏）→ 这就是 `desktopWindowPlus1` 的竞争者 |
| -2147483603 | 访达 | 桌面图标层，区间的**上界** |
| -2147483602 | `Window Server` | 菜单栏（实测高 83px） |

**`desktopWindowPlus1` 不再是干净选项。** 实测该层级有一个整屏的 `WindowManager` 窗口，程序自己的同层竞争检测会如实报出：

```
尝试 desktopWindow+1(-2147483622)：层级 -2147483622 | 在系统壁纸之上 ✓ | 在图标之下 ✓ | 覆盖整屏 ✓ | 同层竞争 1 个 ⚠
```

同层的前后顺序由 WindowServer 决定，不由本程序控制 —— 这正是根 `AGENTS.md` 的「livewall 约定」里要求**必须保留同层竞争检测**的原因。基线 `desktopWindow` 与 `desktopWindowPlus2` 实测均为 0 个竞争。

`WindowManager` 是系统进程（窗口管理 / Stage Manager 相关），不是第三方壁纸软件。它的窗口在实测中不影响壁纸显示（程序已在日常使用），但**不要据此假定该层级可自由使用**。

> 上表后四行的判定来自较早的实测，本次只在 macOS 27.0 上复测了三个 `desktopWindow*` 预设与三个常量；换系统版本后应重测整表，不要只改标题里的版本号。

## 关键发现

1. **商业实现用的是 `desktopWindow`，不是"图标层 -1"。** 本机正在运行的 Dynamic Wallpaper 的两个窗口（主屏 + 副屏各一个）层级均为 `-2147483623`，正好等于 `CGWindowLevelForKey(.desktopWindow)`，与"图标层 -1"（-2147483604）相差 19 层。两者都在有效区间内，但基线应对齐前者。

2. **多屏是"每屏一个窗口"。** 实测该应用为主屏（1512×982）与副屏（1920×1080）各创建一个覆盖窗口。

3. **同层竞争是真实风险。** 第三方壁纸软件与我们的窗口可能落在同一层级，同层前后顺序由 WindowServer 决定，不由我们控制。启动时的层级自检会检出并报警。

4. **`Dock` 的窗口紧邻我们所在层级**（-2147483622 / -2147483624），恰好夹住 `desktopWindow`。目前不冲突，但值得持续观察。

5. **mp4 格式约束已被真实数据验证。** 样本 CDN 返回 `Accept-Ranges: bytes`、`video/mp4`、`H.264 High@L3.2`、`yuv420p`、30fps，`AVPlayerLooper` 远程循环正常（3 次循环，最大间隔偏差 196ms）。

6. **数据源只有 10 秒预览片。** `wallpapers.db` 的「美女」分类（desktop + dynamic，`category.id = 4001`）共 **2,553** 条，每条只有 `1920×1080 / H.264 / 30fps / 10.03s / 约 6MB` 的预览片；去掉 URL 里的 `_10s_for_html` 后缀试原片返回 404，原片不公开。因此循环周期固定约 10 秒，切换间隔默认 5 分钟以稀释重复感。

7. **元数据加载与播放器起播约占 6 秒。** 10 秒的视频要跑满 2 圈需要约 26 秒 —— 做时长相关的观测时要把这个开销算进去。

8. **本机没有 XCTest。** 只装了 Command Line Tools 而无完整 Xcode，`XCTest` 与 `Swift Testing` 均不可用，测试改用 `executableTarget` + 自建断言运行器实现。

9. **窗口必须在 `applicationDidFinishLaunching` 里同步创建。**
   最初把建窗口放在 `DispatchQueue.main.asyncAfter` 里，结果窗口被系统加上**对称边距** —— 1512×982 的屏幕拿到 `9,5 1494x972`，1920×1080 的拿到 `1524,7 1896x1066`，导致「覆盖整屏」判定失败并触发一连串无意义的层级降级。改成启动过程中同步创建后，bounds 精确为 `0,0 1512x982` 与 `1512,0 1920x1080`。
   注意这是**创建时机**的问题，不是窗口属性问题 —— 同一份 `DesktopOverlayWindow` 代码在同步创建时完全正常。

10. **层级判定不能紧跟在建窗口之后。** `orderFrontRegardless()` 是异步的，创建后立刻查窗口列表会查不到自己的窗口，判定返回「未覆盖整屏」。App 需要显式等待窗口上屏（`ScreenCoordinator.waitForWindowsToAppear`，自旋上限 1 秒）。

11. **`AVPlayerLooper` 循环远程 URL 不会重复下载。** 实测用 `nettop` 按进程采样：单曲循环 130 秒、完成 12 次循环，字节计数**从第 1 个样本到第 13 个样本完全冻结在 12.57MB**。若每圈重下应是 12 × 6.28MB = 75MB。**结论：纯流式可行，不需要落盘缓存。**

12. **但每个视频会被下载两遍 —— 如果建了两个 `AVURLAsset`。** 12.57MB ≈ 2 × 6.28MB。原因是元数据校验建一个、播放再建一个，每个都会把整个文件拉一遍。改成 `AVPlayerItem(asset:)` 复用同一个 asset 后，实测降到 **6.53MB/个**（含 HTTP 开销）。注意 `AVURLAssetPreferPreciseDurationAndTimingKey` 的取值**不影响**流量，别在这上面找原因。

13. **AVFoundation 的 404 错误描述里没有状态码。** 实测 `asset.load(.isPlayable)` 对 404 抛出的本地化描述是 `"在此服务器上找不到所请求的URL。"`，**完全不含数字**。曾写了一套正则想从错误文本里捞状态码，被这条实测证伪。改为**播放前先做一次 HEAD 探测**，直接拿 HTTP 状态码分类 —— 否则无法区分「资源失效」（该拉黑）和「服务器临时故障」（不该拉黑）。

## 省电策略

采集与判定**刻意分离**：`PlaybackGovernor`（LiveWall）只负责把系统状态读出来，判定 `PlaybackStateResolver`（LiveWallCore）是纯函数，可以穷举验证。

### 信号与优先级

从高到低，命中即停。**顺序是硬约束**，代码里有对应注释说明理由：

| 顺序 | 信号 | 默认 | 采集方式 |
| ---: | --- | :---: | --- |
| 1 | 用户手动暂停 | — | 菜单点击 |
| 2 | 屏幕已锁定 | 开（不可关） | `com.apple.screenIsLocked` 通知 |
| 3 | 显示器休眠 | 开（不可关） | `NSWorkspace.screensDidSleepNotification` |
| 4 | 画面被完全遮挡 | **开** | 2 秒轮询窗口列表 |
| 5 | 系统温度偏高 | 开 | `thermalStateDidChangeNotification` |
| 6 | 长时间无操作 | 开（300 秒） | 2 秒轮询空闲时间 |
| 7 | 低电量模式 | 开 | 2 秒轮询 `isLowPowerModeEnabled` |
| 8 | 电池供电 | 关 | 2 秒轮询 `IOPSCopyPowerSourcesInfo` |

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

菜单是**五段结构**：状态 → 播放控制 → 设置 → 维护 → 退出。菜单从光标位置向下展开，到达成本与行号正相关，所以高频动作贴顶、低频与破坏性操作置底；同一类别连续成块，破坏位置记忆的插入一律不做。

**状态区**（顶部，全部为禁用行）：

| 行 | 出现时机 | 内容 |
| --- | --- | --- |
| `动态壁纸` | 恒有 | 分组标题 |
| 片名 | 恒有 | 当前（或最后一次成功播放的）条目名 |
| `已暂停：<原因>` | 仅非播放态 | 原因直接读 governor 状态推导（手动 / 遮挡 / 锁屏 / 息屏 / 热压力 / 空闲 / 低电量 / 电池） |
| `⚠ 网络不可达，保持当前画面` | 仅不可达 | 网络状态 |
| 附注 | 有条件 | 见下 |
| `⚠ 热键冲突：…` | 仅注册失败 | 用户唯一能发现「热键被别的程序抢了」的地方 |

**片名与附注刻意是两个字段**。以前共用一个，失败时片名会被「候选池已耗尽」顶掉，用户看不到正在循环的是哪张，容易误读成「壁纸掉了」。附注行分**信息**与**警告**两级，前缀只加在警告上：

- 信息（原样显示）：操作回执，如「开机自启已开启」「窗口层级：…」「多屏策略：…」
- 警告（加 `⚠`）：真异常，如「候选池已耗尽」「过滤后没有可用内容」「保持当前画面」「已暂停调度」

给回执加警告符号会让人以为操作失败了。附注在下一条成功加载时清空。

**热键状态不常驻**：三项组合提示已写在各自菜单项的标题里，再常驻一行纯属重复；只有真冲突时才出现一行。

`省电设置` 子菜单逐项开关，改动直接写回 `config.json` 并立即重算，不需要重启。`无操作时` 下面挂着「空闲阈值」子菜单（1 / 5 / 10 / 30 分钟）。

**阈值默认 300 秒而不是更短**：读文档、盯着代码想事情的时候鼠标本来就不动，太短会让画面在用户明明看着它的时候冻住 —— 这是最容易被感知为「坏了」的一项。

### 有意不做的两件事

- **暂停时不释放播放器。** `pause()` 只调 `player.pause()`，解码停止，但 `AVPlayer` 仍持有已下载的缓冲（约 6.5MB）与解码器实例。`teardown` + 重建能让长暂停（息屏数小时）释放内存，但恢复时画面会迟到约 1 秒且要重新下载 —— 权衡后选择保持。
- **低电量模式走轮询而不是通知。** `NSProcessInfoPowerStateDidChange` 只在 iOS 声明，macOS SDK 里查不到，`ProcessInfo` 也没有对应静态成员。2 秒轮询 `isLowPowerModeEnabled` 的代价可忽略。

## 热键、自启、多屏、选片与过滤

### 全局热键

| 组合 | 作用 |
| --- | --- |
| `⌥⌘P` | 暂停 / 继续 |
| `⌥⌘N` | 下一张 |
| `⌥⌘R` | 重新加载清单 |

用 Carbon 的 `RegisterEventHotKey`，**不需要辅助功能授权** —— `NSEvent.addGlobalMonitorForEvents` 那条路会弹权限窗、还要重启 App 才生效。

代价是全局热键会**抢占**该组合，其它 App 收不到这个按键。所以只挑不常用的 `⌥⌘` 组合，并且**注册失败会显式提示**：重复注册同一组合返回 `eventHotKeyExistsErr`（-9878），据此区分「被占用」与「其它失败」，菜单里单独标出。

> 菜单项**刻意不设 `keyEquivalent`**：那会让菜单打开时全局热键与菜单项各触发一次，切换类操作执行两遍等于互相抵消。

没有 `⌥⌘M 静音`：壁纸被硬性要求静音（`player.isMuted = true`），一个永远无效的开关比没有开关更糟。

### 开机自启

用 `SMAppService.mainApp`（macOS 13+），注册到「系统设置 → 通用 → 登录项」，用户看得见也管得着。刻意不用另外两条路：`LSSharedFileList` 在 macOS 13 起已废弃；往 `~/Library/LaunchAgents` 写 plist 会绕过登录项的用户可见性。

**实测**：App 放在 `~/Coding/.../build/LiveWall.app`（**不在 `/Applications` 下**）也能注册成功，注册后状态变 `enabled`，注销后回到 `notFound`。

注意 `SMAppService.mainApp.status` 在**未注册**时返回的是 `notFound` 而不是 `notRegistered` —— 别被名字骗了。曾据此在菜单里显示「不可用（需在 .app 内运行）」，而功能其实完全可用，属于会让用户放弃使用的假故障。两个「没开启」状态现在统一显示为「未开启」。

### 多屏策略

| 策略 | 行为 | 状态 |
| --- | --- | --- |
| 全部同片 | 所有屏幕同一张，共用一个播放器 | ✅ 已实现 |
| 仅主屏 | 只在主屏播放，其余屏保留系统壁纸 | ✅ 已实现 |
| 每屏独立 | 每块屏各自取片，流量与解码按屏数翻倍 | ❌ 未实现 |

「仅主屏」用 `NSScreen.screens.first` 而不是 `NSScreen.main` —— 后者是「当前键盘焦点所在的屏幕」，会随用户拖窗口漂移，用它会导致窗口建到副屏上。

`perScreen` 需要「每屏一个独立播放槽位」（各自的播放器、候选池、调度定时器），而当前 App 是单槽位结构，尚未改造。菜单里**不列出未实现的策略** —— 否则用户会选到一个与「全部同片」表现完全一样的选项，还以为功能坏了。

### 选片顺序与切换间隔

候选集由「内容过滤」筛出，选片顺序决定这一轮里按什么次序取。

| 顺序 | 一轮的排列 | 说明 |
| --- | --- | --- |
| 随机（默认） | 每轮把候选集重新打乱 | 洗牌前排除当前这条，避免刚播完又抽到它 |
| 顺序 | 按清单原序循环 | 清单顺序由 `wallpapers export-livewall` 决定，稳定可预期 |

**两条共同性质**（因此「一轮内不重复」两种模式都成立）：一轮的长度等于可用条目数（黑名单除外）；走完一轮才重排，不是「每次随机抽一条、抽到重复就重抽」。

**顺序模式不能沿用「排除当前项」。** 那样每轮都会少一条尾巴，实际播放序列会变成 `A…Z → A…Y → A…X` —— 第二轮不是从清单开头重新开始，看起来像漏播。正确做法是整段原序照排，只在**新一轮的第一条恰好等于当前正在播的那条**时向后让一位（典型场景是刚改了顺序或过滤条件，队列被清空重建）。

**切换间隔的单位是秒**，菜单预设 30 秒 / 1 / 2 / 5 / 10 / 30 分钟 / 1 小时，共 7 档：

- 下限 **10 秒** ≈ 一条预览片的时长。再短就是在视频播到一半时切走，解码器反复重建、每张都得重新拉流，纯粹浪费，画面也没来得及看清。
- 上限 **24 小时**。再长等同「几乎不换」，那是「暂停播放」要解决的问题。
- 范围外的值**夹到最近的合法值**而不是退回默认 —— 手改配置的人多半只是「填得太短/太长」，夹紧更接近他的本意；非有限值（NaN / ±∞）夹不了，才退回默认 300 秒。
- 注意 `intervalSeconds` 取 0 或负数**不等于**「播完即切」—— 后者要显式开 `switchWhenFinished`。

实际间隔还会叠加 `jitterRatio`（默认 ±20%）。纯固定间隔会让人形成「什么时候会变」的预期，加抖动更自然。**抖动与合法区间刻意不写进菜单**：子菜单只留 7 档可点的预设，把「为什么不是正好 5 分钟」的解释交给日志（每次切换都会打出生效值）与本节文档 —— 常驻的两行禁用说明在只有 7 个选项的菜单里纯属噪音。

运行时改动怎么生效：

| 改动 | 生效方式 | 验证 |
| --- | --- | --- |
| 改自动切换间隔 | 当前这张继续播，**立刻按新间隔重新计时**（作废旧定时器）。否则用户改完盯着看毫无变化，只会以为没点上 | 实测 |
| 改选片顺序 / 过滤条件 | **不立刻换片**（当前这张在新条件下依然合法），只清空待取队列 —— 等于重新开始一轮，下一张起按新规则取 | 实测 |
| 任何改动 | 立即写回 `config.json`，重启后保持 | 实测 |
| 正在等网络恢复 | 间隔改动**不插队**：那条 60 秒重试有自己的节奏，抢过来会变成「每改一次间隔就立刻重试一次加载」 | 代码存在，未真机触发 |
| 当前处于暂停 | 间隔改动记下，恢复播放后生效 | 代码存在，未真机触发 |

黑名单**任何情况下都不清**（除「黑名单覆盖了全部候选」这种整体失效的兜底）—— 那是「资源失效」的记录，与用户选了什么无关。

**实测证据**（同一秒内改间隔，播放项不变）：

```
[15:36:48.721] 下次切换在 28.9 秒后（间隔设置 30 秒，抖动 ±20%）
[15:36:51.825] 切换间隔改为 10 分钟
[15:36:51.826] 下次切换在 696.5 秒后（间隔设置 10 分钟，抖动 ±20%）
[15:36:51.839] 选片顺序改为顺序（按清单原序循环）：候选 2614 条，下一张起按新顺序，本轮重新开始
```

696.5 = 600 × 1.161，抖动落在 ±20% 内；`正在播` 在改动前后是同一张。日志里每次切换都会打出生效值，**这一行就是「改动有没有生效」的判据**。

### 内容过滤

按**作者**过滤（可多选），选项取自清单里**实际出现过**的作者（50 个，按条目数降序）。选了当前清单里没有的作者只会得到「过滤后没有可用内容」，所以选项不用数据库里的全量作者。

**为什么不是标签**：数据源在采集侧根本没有标签。实测 2,614 条候选里带 tag 的是 **0 条**；全库 14,449 个 tag 只挂在桌面**静态**壁纸（32,430 条）与手机端壁纸上，与 `desktop + dynamic` 的交集为空。相比之下 `author` 100% 非空。`CandidateFilter` 里保留了标签维度，等数据源补齐后无需改调用方。

过滤改动会立即重建候选集并清空待取队列（队列里可能还有被过滤掉的条目，不清会在切换时漏出来），但**不清黑名单** —— 那是「资源失效」的记录，与用户选了什么无关。

### 窗口 bounds 稳定等待（一个既有 bug 的修复）

`waitForWindowsToAppear()` 原先只等「窗口号出现在 WindowServer 列表里」。但**窗口上屏时有一段对称缩放的进入动画**：实测 1512×982 的窗口在动画期间会被报成 `9,6 1494x970`、`5,3 1502x976`（两次采样值不同，说明是动画而不是真实 frame）。动画没结束就跑 `evaluate`，会得到「未覆盖整屏」并触发一连串无意义的降级。

现在改为等到 **WindowServer 报的 bounds 与屏幕一致**才返回。比较时**不能用 `NSWindow.frame`** —— 它用「原点在主屏左下」的坐标系，副屏上两者会差一个主屏高度（实测同一窗口 `NSWindow.frame.y = -98` 而 `CGWindowBounds.y = 0`）。所以 `ScreenCoordinator` 单独记了一份「期望覆盖区域」，用 `CGDisplayBounds` 的坐标系。

这个 bug 一直存在于「屏幕变化 / 唤醒后重建窗口」路径上，只是之前没人验证过运行期的 frame 正确性。

## 路线图

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **步骤 0** | 构建体系升级：SwiftPM + 目录重组 + 测试运行器 | ✅ 已完成 |
| **步骤 0.5** | 仓库文档同步（根 `README.md` / `AGENTS.md`） | ✅ 已完成 |
| **P1** | 清单导出与拉取 + 候选池 + 切换调度 | ✅ 已完成 |
| **P2** | 流量测量 + 失败处理（CDN 失效 / 断网 / 解码失败） | ✅ 已完成 |
| **P3** | 省电 Governor + 遮挡检测修正 + 设置界面 | ✅ 已完成 |
| **P4** | 热键、开机自启、多屏策略、内容过滤 | 🟡 部分完成（每屏独立未做） |

**P1 的实际能力**：读取清单（远程 `https://studio.meowv.com/data/livewall.json` 优先，失败回退远程副本 → 内置）、按一轮不重复的洗牌队列选片、按 5 分钟 ±20% 抖动切换、多屏每屏一个覆盖窗口、启动时做层级自检并在不合格时降级。

**P2 的实际能力**：播放前 HEAD 探测拿 HTTP 状态码；失败按 `FailurePolicy` 分四路处理 —— 资源失效（403/404/4xx）直接拉黑换下一条、网络临时故障（超时/DNS）重试一次、**网络不可达时保持当前画面不动且绝不拉黑**、连续 3 次失败停止调度。网络恢复时立刻重试，不等定时器。

**关于缓存：实测后决定不做。** 详见「关键发现 11」——`AVPlayerLooper` 一次下载后就不再产生流量，而洗牌模式下 2,600 条候选每条约 9 天才轮到一次，LRU 缓存永远命中不了，纯属浪费磁盘。断网兜底也不需要它：当前视频已被 AVFoundation 缓冲，继续循环即可。这正好符合项目定位里的「本地不做大量视频存储，仅在必要时做轻缓存」。

**P2 已知未做**：多屏只能全部同片，每屏独立留给 P4；失效黑名单只存在内存里，重启后重新尝试（考虑到 CDN 可能恢复，这是有意的）。

**P3 的实际能力**：省电从两路（显示器休眠、锁屏）扩到八路，新增遮挡、热压力、空闲、低电量模式、电池供电；遮挡检测从「union + bounding box」换成**坐标压缩法精确面积**（修掉两个半屏窗口被误判成完全遮挡的 bug）；省电开关与空闲阈值可在菜单里实时切换并写回配置。详见[省电策略](#省电策略)。

**P3 已知未做**：暂停时不释放播放器（有意，理由见上）；`pauseOnBattery` 默认关闭 —— 插拔电源就暂停会让画面频繁抖动，需要的人自己开。

**P4 的实际能力**：三个全局热键（`⌥⌘P` / `⌥⌘N` / `⌥⌘R`，零权限，被占用时显式提示）；开机自启开关（`SMAppService`）；多屏策略「全部同片」与「仅主屏」；按作者过滤内容（可多选，选项取自清单实际出现的 50 个作者）；选片顺序（随机 / 顺序）与自动切换间隔（7 档预设，范围 10 秒 – 24 小时）可在菜单里实时切换并写回配置，见[选片顺序与切换间隔](#选片顺序与切换间隔)。顺带修掉一个既有 bug：窗口上屏的进入动画会让 bounds 在动画期间内缩，导致「未覆盖整屏」误判。

**P4 已知未做**：**「每屏独立」策略未实现**（需要把 App 改造成「每屏一个播放槽位」的多槽位结构，属架构级改动）；热键组合固定，不可配置。标签过滤因**数据源没有标签**（`desktop + dynamic` 的 2,614 条里带 tag 的是 0 条）改为按作者过滤。

## 技术栈约定

- 原生 Swift + AppKit + AVFoundation，**不用 Electron / Tauri** —— `NSWindow.level` 与 `collectionBehavior` 的精确控制是本方案成败所在。
- 用 SwiftPM 组织代码，编译只需要 Command Line Tools，不需要 Xcode。
- 不引入第三方依赖。
- 纯逻辑一律放 `LiveWallCore`，保持可脱离 GUI 单测。
- 构建与运行只走本目录的 `build.sh` / `test.sh` / `run.sh`，**不接入根目录的 `build.sh` / `run.sh` / `deploy.sh`** —— 注意本目录的 `run.sh` 与根目录的 `run.sh` 是同名不同物，前者只管 livewall。
