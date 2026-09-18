# livewall

macOS 视频动态壁纸工具。**个人自用 / 小范围共享**定位，不面向大规模公开发布。

## 名称与用途

| 项 | 说明 |
| --- | --- |
| 名称 | `livewall` —— live wallpaper 的缩写。目录、Swift 模块、脚本一律用此名 |
| 界面显示名 | 「动态壁纸」—— 菜单栏标题与系统里显示的应用名（`CFBundleName` / `CFBundleDisplayName`）。**只影响用户可见文案，代码与路径仍是 `livewall`** |
| 用途 | 把一段 mp4 放到 macOS 桌面层循环播放，替代静态壁纸 |
| 平台 | 仅 macOS（本机实测 macOS 26.6.2 / arm64） |
| 内容 | 仅视频壁纸（mp4），不做静态图片、不做网页/WebGL 壁纸 |
| 数据源 | CDN 上的 https 直链，本地不建视频库 |
| 与 `wallpapers/` 的区别 | `wallpapers/` 是 Python 采集器（抓元数据进 SQLite）；`livewall` 是客户端播放器。两者无代码依赖 |

**刻意不做的事**（定位决定的）：用户系统、后端服务、多租户、权限体系、运营审核、埋点统计。唯一需要的"服务端"是一个静态 JSON 清单 + 一堆 mp4 文件。

## 当前状态

这个 App 可以日常使用：清单拉取 + 洗牌选片 + 5 分钟抖动切换 + HEAD 探测与四路失败处理，一套**信号 → 状态**的省电状态机（遮挡 / 锁屏 / 息屏 / 热压力 / 空闲 / 低电量 / 电池 + 手动暂停），三个免授权的全局热键，开机自启开关，多屏策略（全部同片 / 仅主屏），以及按作者的内容过滤。菜单里能实时改的东西都不需要重启。

**未完成**：多屏的「每屏独立」策略需要架构级改造（多播放槽位），见[多屏策略](#多屏策略)。

## 目录结构

```
livewall/
├─ Package.swift                SwiftPM 清单，三个 target（见下）
├─ README.md                    本文件：项目定位、结构、快速开始
├─ build.sh                     编译并组装 .app
├─ test.sh                      运行 LiveWallCore 单元测试
├─ run-livewall.sh              运行正式 App
├─ Resources/
│  └─ Info-LiveWall.plist   App 的 Info.plist（bundle id com.meowv.livewall）
├─ Sources/
│  ├─ LiveWallCore/     纯逻辑库，不依赖 NSApplication，可脱离 GUI 单测
│  │  ├─ LevelPreset.swift      层级预设与有效区间（值全部由 CGWindowLevelForKey 派生）
│  │  ├─ TextLayout.swift       终端显示宽度对齐（中文占两列）
│  │  ├─ CatalogModel.swift     清单的 Codable 结构 + 解析/清洗
│  │  ├─ CatalogService.swift   清单降级链（远程 → 远程副本 → 内置）
│  │  ├─ CandidatePool.swift    洗牌队列，一轮内不重复 + 失效黑名单
│  │  ├─ SchedulePolicy.swift   切换间隔与抖动
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
./run-livewall.sh

# 退出：菜单栏图标 → 退出，或 pkill -x LiveWall
# 日志：~/Library/Logs/com.meowv.livewall/livewall.log

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
`intervalSeconds` 是切换间隔（默认 300 秒 = 5 分钟），`jitterRatio` 是抖动比例。
`multiScreenPolicy` 见[多屏策略](#多屏策略)，`authorFilter` 见[内容过滤](#内容过滤)。
末尾六项是省电开关，语义见[省电策略](#省电策略)。

运行时菜单栏会出现 `◉`/`◐`，可在其中下一张、暂停、切换窗口层级与多屏策略、**逐项开关省电策略**、**按作者过滤内容**、**开关开机自启**、重新加载清单、打印层级表。

## 本机实测基线（macOS 26.6.2 / arm64 / 双屏）

```
CGWindowLevelForKey(.desktopWindow)     = -2147483623
CGWindowLevelForKey(.desktopIconWindow) = -2147483603
系统壁纸进程「墙纸」实际占用             = -2147483625
```

有效层级区间（左开右开）：**(-2147483625, -2147483603)**，共 21 层可选。

层级标定实测结果：

| 预设 | 层级 | 在壁纸之上 | 在图标之下 | 结论 |
| --- | ---: | :---: | :---: | --- |
| `desktopWindow` | -2147483623 | 是 | 是 | ✅ **推荐基线** |
| `desktopWindowPlus1` | -2147483622 | 是 | 是 | ✅ |
| `desktopWindowPlus2` | -2147483621 | 是 | 是 | ✅ |
| `iconMinus2` | -2147483605 | 是 | 是 | ✅ |
| `iconMinus1` | -2147483604 | 是 | 是 | ✅ |
| `iconAboveGap1` | -2147483602 | 是 | **否** | 覆盖桌面图标（"专注模式"用） |
| `iconAboveGap2` | -2147483601 | 是 | **否** | 覆盖桌面图标（"专注模式"用） |

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

`省电设置` 子菜单逐项开关，改动直接写回 `config.json` 并立即重算，不需要重启。`无操作时` 下面挂着「空闲阈值」子菜单（1 / 5 / 10 / 30 分钟）。

**阈值默认 300 秒而不是更短**：读文档、盯着代码想事情的时候鼠标本来就不动，太短会让画面在用户明明看着它的时候冻住 —— 这是最容易被感知为「坏了」的一项。

### 有意不做的两件事

- **暂停时不释放播放器。** `pause()` 只调 `player.pause()`，解码停止，但 `AVPlayer` 仍持有已下载的缓冲（约 6.5MB）与解码器实例。`teardown` + 重建能让长暂停（息屏数小时）释放内存，但恢复时画面会迟到约 1 秒且要重新下载 —— 权衡后选择保持。
- **低电量模式走轮询而不是通知。** `NSProcessInfoPowerStateDidChange` 只在 iOS 声明，macOS SDK 里查不到，`ProcessInfo` 也没有对应静态成员。2 秒轮询 `isLowPowerModeEnabled` 的代价可忽略。

## 热键、自启、多屏与过滤

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

**P4 的实际能力**：三个全局热键（`⌥⌘P` / `⌥⌘N` / `⌥⌘R`，零权限，被占用时显式提示）；开机自启开关（`SMAppService`）；多屏策略「全部同片」与「仅主屏」；按作者过滤内容（可多选，选项取自清单实际出现的 50 个作者）。顺带修掉一个既有 bug：窗口上屏的进入动画会让 bounds 在动画期间内缩，导致「未覆盖整屏」误判。

**P4 已知未做**：**「每屏独立」策略未实现**（需要把 App 改造成「每屏一个播放槽位」的多槽位结构，属架构级改动）；热键组合固定，不可配置。标签过滤因**数据源没有标签**（`desktop + dynamic` 的 2,614 条里带 tag 的是 0 条）改为按作者过滤。

## 技术栈约定

- 原生 Swift + AppKit + AVFoundation，**不用 Electron / Tauri** —— `NSWindow.level` 与 `collectionBehavior` 的精确控制是本方案成败所在。
- 用 SwiftPM 组织代码，编译只需要 Command Line Tools，不需要 Xcode。
- 不引入第三方依赖。
- 纯逻辑一律放 `LiveWallCore`，保持可脱离 GUI 单测。
- 构建与运行只走本目录的 `build.sh` / `test.sh` / `run-livewall.sh`，**不接入根目录的 `build.sh` / `run.sh` / `deploy.sh`**。
