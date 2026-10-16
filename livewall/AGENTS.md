# livewall 协作约定

适用于 `livewall/`。仓库通用规则见 [`../AGENTS.md`](../AGENTS.md)；项目用途、目录、命令与功能见 [`README.md`](./README.md)。这里仅记录改动时必须守住的边界和验证要求。

## 修改边界与代码组织

- 只处理当前任务涉及的项目。`build/`、`.build/` 是生成物；签名私钥位于仓库外的 `~/.livewall-signing/version-key.txt`，不得写入源码、日志或文档。
- 保持原生 Swift + AppKit + AVFoundation 架构，不引入第三方依赖。`LiveWallCore` 放可单测的纯逻辑，`LiveWallDesktop` 只包桌面层 AppKit 能力，`LiveWall` 负责系统事件与编排；具体 target 以 `Package.swift` 为准。
- `AppDelegate.swift` 保存实例状态与生命周期，按职责拆分的方法放在相应 `AppDelegate+*.swift`。新增状态不能放进 extension；跨文件成员需要 `internal` 时不必为保留 `private` 而把方法搬回主文件。
- 测试使用 `LiveWallCoreTests` 可执行 target 和自建断言运行器。本机只有 Command Line Tools，不要把它改成依赖 XCTest 的 `testTarget`。新增测试函数时在 `Tests/LiveWallCoreTests/main.swift` 登记；`./test.sh` 会检查漏登记。

## 运行时不变量

### 桌面与播放

- 覆盖窗口层级由 `CGWindowLevelForKey` 推导，位于系统壁纸与桌面图标之间；保留同层竞争检测。识别系统壁纸不能只用 `contains("wallpaper")`，进程名可能本地化。
- 覆盖窗口必须静音、忽略鼠标事件，且视频播放不得阻止显示器休眠。启动时同步创建窗口；层级判定要等 WindowServer 报告的 bounds 稳定，并在同一坐标系比较。仅主屏模式使用 `NSScreen.screens.first`。
- 省电状态仍由 `LiveWallCore/PlaybackStateResolver` 纯函数判定；系统事件只更新信号，播放器暂停与恢复集中在 `AppDelegate.applyPlaybackState`。异步加载完成后重查状态，避免暂停期间的在途加载自行开播。
- 每屏的失败与重试按槽位分开，全部槽位失败后才停止调度；只有主槽位安排切换定时器。遮挡面积继续用 `CoverageGrid` 精确计算，不退回采样网格或 bounding box。
- 同一视频复用 `VideoLoader` 创建的 `AVURLAsset`，避免校验与播放重复下载。不添加本地视频缓存；断网时保持当前画面，网络错误不得拉黑可用条目。
- `CandidatePool` 的随机与顺序模式都要走完一轮才重排。固定播放是候选池之上的独立状态，不是第三种 `PlaybackOrder`；固定项在 `Preferences.pinnedItem` 保存完整条目，以便切分类后仍可恢复。

### 清单、来源与配置

- 内容清单的 `catalog.json` 只放索引，不放条目；它与 `catalog.json.sig` 成对使用。客户端先验索引原始字节的签名，再验证切片摘要和归属；摘要缺失、签名失败或切片不符都不能降级放行。清单格式改动需同步检查 `wallpapers/src/wallpapers/export.py`。
- 远端提供的切片文件名只接受同源的纯 `.bin` 文件名；切片先校验索引摘要和密钥标识，再解密解析。切分类的异步请求要丢弃过期结果；加载成功后才替换候选池、勾选和记忆值，失败时保持当前播放。浏览窗口只能读取切片，不得写播放使用的单份离线缓存，并使用独立的请求序号。
- 线上与本地来源、选片顺序分别建模。本地条目用 `WallpaperItem.playableURL` 接受 `file://`；本地文件不做 HTTP HEAD，文件不可读按资源失败处理。持久化 ID 必须由绝对路径稳定生成，不用进程内随机化的 `Hashable`。文件夹暂时不可用时保留配置、回退线上，手动重载再扫描。
- `Preferences` 保持逐字段容错解码；新增字段时同步处理缺键和非法枚举值，并补往返测试。修改默认值不会迁移已写入 `config.json` 的旧值；清洗后落盘失败不能静默忽略。

### 菜单、窗口与退出

- 同一程序用 `flock` 防多开，在创建 `NSApplication` 前取锁；不要改用 PID 文件。开发豁免只能由明确真值触发。菜单栏状态项保持常驻；菜单退出、信号终止与系统终止共用 `shutdown()`，不得阻拦系统关机。
- 带 target/action 的菜单项统一在 `validateMenuItem(_:)` 判可用性，避免 AppKit 的自动校验覆盖构建时设置的 `isEnabled`。更新菜单只由 `UpdateState` 驱动；操作回执与真正异常保留各自的生命周期。
- 全局热键继续用 Carbon `RegisterEventHotKey`，注册失败要可见；菜单快捷键只写进标题，不设 `keyEquivalent`，避免一次操作触发两遍。浏览窗口的关闭只清理预览和缩略图请求，不终止 App 或桌面播放；窗口交互改动必须检查实际点击、预览与关窗行为。
- 锁屏预览的静态图地址来自清单 `coverUrl`，不能推导 URL；下载或抓帧失败时保留现有墙纸。图像编码、下载和目录扫描不得阻塞主 actor。退出时仅固化已缓存的当前静态图，不在退出路径同步补图。

## 并发与发布边界

- 项目使用 Swift 6 严格并发。`AppDelegate` 的隔离需显式标注；`Timer`、通知、KVO 和网络回调即使投递到主队列，也不会自动获得主 actor 隔离，修改 UI 或共享状态前须回到 `@MainActor`。非 `Sendable` 对象不要跨 actor 传递；放宽检查前先证明线程契约并说明理由。
- `SharedVideoLoadStore` 的查找与插入必须在同一把锁内完成，取消任务放在锁外。`nonisolated async` 的下载与加载会离开主 actor，不可据调用点在主线程就移除共享状态保护。
- 开发运行不递增 `CFBundleVersion`；发布构建的 `--bump-build` 要在组装及签名 App 前执行，不能与 debug 合用。开发者工具由 `Preferences.developerToolsEnabled` 控制，默认关闭，菜单可即时切换并保存；关闭时取消采样并释放监控器。调整隔离边界时分别验证 debug 与 release 配置。
- 更新清单 `version.json` 与 `version.json.sig` 必须同批发布。两类签名都覆盖清单原始字节，不能手工格式化或改写已签文件，也不能加入验签失败后只信任 `sha256` 的退路。内容清单由导出脚本生成，再由根 `build.sh` 签名；单独导出不能当作可发布产物。发版路径与产物位置以根脚本和 [`README.md`](./README.md) 为准。

## 验证

- 文档或代码改动先检查相关 `git diff` 与 `git diff --check`。纯逻辑改动优先跑 `./test.sh`；改 shell 脚本按根协作规则执行 `bash -n`，并在非 `C` locale 下跑实际帮助或 dry-run 路径。
- 窗口层级、播放、生命周期或浏览交互改动，需要在 macOS 真机短时运行并检查相关操作。浏览窗口的探针不能替代人工点击与预览观感检查。
- 默认不跑完整构建或端到端测试。若只有完整构建才能可靠验证，先说明原因并取得同意；最终只报告实际执行的检查和未验事项。
