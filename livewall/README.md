# livewall

macOS 26.0+ 菜单栏视频壁纸 App，使用 Swift、AppKit 和 AVFoundation，将 MP4 循环播放在桌面层。项目供个人使用和小范围共享；界面显示名为「动态壁纸」，App 包名和可执行文件名仍是 `LiveWall`。

- 修改边界与验证要求：[AGENTS.md](./AGENTS.md)
- 壁纸数据的采集与导出：[wallpapers/README.md](../wallpapers/README.md)
- 仓库脚本与部署产物：[根 README](../README.md)

## 功能与限制

- 壁纸来源可选线上清单或本地 MP4 文件夹。支持随机、顺序、固定播放、切换间隔、分类过滤，以及全部屏幕同片、仅主屏、每屏独立三种策略。
- 根据手动暂停、锁屏、息屏、遮挡、空闲、低电量和热状态暂停播放；菜单栏可调整相应设置，另有热键和开机自启。默认 `⌥⌘F` 收藏或取消收藏当前线上壁纸，`⌥⌘X` 禁用或恢复当前线上壁纸；组合可在菜单中修改。
- 浏览窗口按分类展示线上壁纸，支持当前列表搜索、收藏、禁用、预览和设为桌面壁纸。菜单可下载当前视频及其静态预览图到 `~/Downloads/livewall/`。
- 休息提醒按活跃使用时间计时，休息层覆盖所有屏幕；锁屏或息屏时暂停倒计时。
- 锁屏预览保留当前壁纸的静态图；macOS 27 上还会尝试通过 Aerial 播放动态预览。退出时保留当前壁纸的静态图，关闭锁屏预览开关时才恢复记录的原墙纸。

动态锁屏依赖非公开的 Aerial 资源格式，会影响被替换的 Apple 槽位和系统屏保；系统更新或重新下载 Aerial 可能覆盖它。其他系统版本或动态准备失败时使用静态图。浏览窗口在离线时只可查看已有的当前分类缓存；热键组合与下载目录暂不可配置。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `Package.swift` | SwiftPM 目标与 macOS 版本要求 |
| `Sources/LiveWallCore/` | 不依赖 GUI 的配置、清单、播放策略及可测试逻辑 |
| `Sources/LiveWallDesktop/` | AppKit 桌面层窗口与层级探测 |
| `Sources/LiveWall/` | 菜单栏 App、播放器、浏览窗口、锁屏与更新 |
| `Tests/LiveWallCoreTests/` | Core 测试和自建断言运行器 |
| `Resources/` | `Info.plist` 与图标 |
| `tools/sign-version.swift` | 内容清单和更新清单的签名、验签工具 |
| `run.sh`、`build.sh`、`test.sh`、`make-dmg.sh` | 开发运行、组装 App、测试、打包 DMG |

配置字段以 [`Preferences.swift`](./Sources/LiveWallCore/Preferences.swift) 为准；私有数据与日志路径以 [`LiveWallPaths.swift`](./Sources/LiveWallCore/LiveWallPaths.swift) 为准。SwiftPM 使用 Swift 6；本机只需 Xcode Command Line Tools，不依赖完整 Xcode 或第三方 Swift 包。测试使用可执行目标，运行 `./test.sh`，无需 XCTest。

## 快速开始

在仓库根目录执行：

```bash
cd livewall
./run.sh             # debug 构建并运行，会接管桌面壁纸层
./run.sh --release   # 以 release 构建运行
./test.sh            # Core 测试
bash tools/test-catalog.sh  # 只编译清单相关 Core，测试缓存、跨语言加解密和模拟发布
```

通过菜单栏「退出动态壁纸」正常退出；`pkill -x LiveWall` 也会触发清理。App 默认只允许一个实例；开发时可用 `./run.sh --allow-multiple` 显式放开。`./run.sh` 不递增 `CFBundleVersion`。

日志在 `~/Library/Logs/com.meowv.livewall/livewall.log`，配置与缓存位于 `~/Library/Application Support/com.meowv.livewall/`。默认线上内容由 App 自行拉取，无需在本目录准备清单；`DataCache/` 仅以密文保存最近成功加载的索引 `catalog.remote-cache.index.bin` 和一份切片 `catalog.remote-cache.slice.bin`，索引原始字节的签名保存在 `.index.bin.sig`。启动会删除两个旧目录中的清单 JSON 缓存；网络层使用无磁盘缓存的临时会话，不提供明文回退。配置 `config.json` 仍以 JSON 保存用户设置和收藏、固定、禁用条目；原墙纸恢复记录 `original-wallpapers.json`、系统 Aerial 清单和运行日志保留原格式，它们不属于目录缓存。

## 浏览窗口

浏览窗口为分类栏加条目网格。悬停卡片图片时可点中央预览按钮，也可双击图片区域；两种入口打开同一个预览浮层并立即播放。预览画面保持 16:9，大小随网格可用宽高调整。
首次打开会按主屏实际显示的壁纸选择所属分类，并在列表加载后选中、滚动到该卡片，不自动播放预览；已经打开的窗口再次前置时保留浏览位置。条目不在可浏览的线上分类或收藏里时保持原有分类回退。

网格顶部的搜索框仅筛选当前已加载列表的标题、作者和标签，不额外下载分类。搜索忽略大小写和首尾空白，多个空白分隔的关键词须全部匹配，可分别命中不同字段。切分类或进入「我的收藏」时保留关键词，重新打开窗口时清空；`⌘F` 关闭预览并聚焦搜索框。

卡片左上角的星标、预览底栏的「收藏／取消收藏」、菜单「收藏当前壁纸」与 `⌥⌘F` 共用同一份收藏。左栏「我的收藏」按最近收藏在前展示，支持搜索、预览与设为桌面壁纸；收藏保存完整线上条目，跨分类和重启保留，离线时也能显示收藏信息，封面与视频仍需可用的网络资源。取消收藏不会解除固定播放；从收藏设为桌面时保留原播放过滤，解除固定后恢复该过滤轮换。收藏不包含本地视频。保存失败会在浏览窗口与菜单中明确提示。

菜单「禁用当前壁纸」紧跟收藏入口，与全局热键 `⌥⌘X` 共用入口；浏览窗口的分类卡片、预览底栏与左栏「已禁用」均可禁用或恢复线上条目。禁用与收藏互斥，启用任一状态会移除另一状态；禁用项仍可预览，但恢复前不能设为桌面壁纸，也不会进入自动轮换。禁用正在播放或固定的条目会立即尝试切换；当前过滤没有其他候选时保留最后画面并暂停，恢复条目或更换过滤后继续播放。本地文件夹视频不支持禁用。

菜单「快捷键设置…」可给五项操作录入字母或数字与 ⌘ 或 ⌃ 的组合（可再加其它修饰键），并逐项恢复默认；更改成功后立即生效，重启后保留。单字母、单 ⌥ 或单 ⇧ 不作为全局热键。应用内重复组合会被拒绝，注册或保存失败时保留原组合。全局热键采用非独占注册，其他应用仍可能响应相同组合。

线上来源有收藏时，菜单「内容过滤」增加「收藏」。切换到收藏保留原来的随机／顺序／固定模式：随机与顺序按收藏候选播放，顺序沿用最近收藏在前的列表顺序；固定模式继续播放原固定项，即使它不在收藏中。在收藏分类点击「固定」保留收藏过滤。切换间隔、播完切换、多屏与省电配置保持生效。过滤选择会保存并在重启后恢复，收藏播放不依赖分类索引或切片加载成功。增删收藏会更新下一次轮换的候选，当前画面继续保留；收藏清空后移除菜单入口并恢复上次普通分类或「全部」。切换内容过滤不会更改选片顺序或解除固定播放，解除固定后才按当前过滤轮换。

预览期间，遮罩会拦截整个网格区域的点击；点击面板外的暗区不会关闭预览或操作下层卡片。通过底栏「关闭预览」、`Esc` 或 `⌘W` 关闭；切换分类也会关闭预览。预览关闭后，`Esc` 会先清除正在编辑的非空搜索，否则关闭窗口；`⌘W` 关闭窗口。在预览中取消收藏仍可继续观看当前条目。点击「设为桌面壁纸」会固定该条目；关闭浏览窗口不影响桌面播放。

## 内容清单与签名

线上内容位于 `https://studio.meowv.com/data/livewall/`：

| 文件 | 用途 |
| --- | --- |
| `catalog.json` | 分类索引和各切片的 SHA-256 摘要，不包含壁纸条目 |
| `catalog.json.sig` | 索引原始字节的 Ed25519 签名 |
| `all.<摘要>.bin`、`category.<id>.<摘要>.bin` | gzip + AES-GCM 加密的全部条目或分类切片，按需下载 |

索引使用 schema v2，记录加密格式、压缩方式和 `keyID`。客户端先验索引签名及密钥标识，再按索引摘要校验密文，解密后由系统 zlib 校验 gzip 并限制解压到 16 MiB，最后解析及检查分类归属；失败时只回退到同样通过校验的本地密文副本。单独运行 `wallpapers export-livewall` 只导出中间 JSON，**不会加密或签名**。仓库根目录的 `./build.sh wallpapers` 会沿用 `.livewall-key` 生成并签名 `.bin`；正式 LiveWall App 构建会生成新密钥，并把同一密钥嵌入 App、同步生成 `.bin`。`catalog.json` 与 `catalog.json.sig` 必须一起更新。生产链路见[根 README](../README.md)和[wallpapers/README.md](../wallpapers/README.md)。

### 内容清单签名

更换 Ed25519 签名密钥后（区别于每次 App 发布轮换的清单加密密钥），`CatalogTests.swift`、`CatalogCryptoTests.swift` 和 `UpdateSignatureTests.swift` 的固定签名向量也要重签：用 `printf '%s'` 将测试中的原始 JSON 写入临时文件，不加换行；在本目录执行 `./tools/sign-version.swift sign --json <临时文件>`，再把生成的 `.sig` 中的 `signature` 写回测试。测试向量含占位摘要，因此不传 `--catalog` 或 `--dmg`；正式产物仍由构建脚本带摘要对账参数签名。

## 版本检查与更新

App 从 `https://studio.meowv.com/data/livewall/version.json` 检查更新，以 `CFBundleVersion` 对应的 `build` 数值判断新旧。发现新版本后只下载并校验 DMG，交由用户安装；不会自动覆盖运行中的 App。手动检查会在菜单中反馈结果，自动检查失败只记日志。

### 更新清单签名

`version.json.sig` 必须与 `version.json` 同批提供。客户端先用内嵌公钥验签，再解析版本信息；下载的 DMG 还会按清单中的必填 `sha256` 校验。内容索引和更新清单由同一工具 `tools/sign-version.swift` 签名，密钥保存在本机的 `~/.livewall-signing/version-key.txt`，不进入仓库。更换密钥需要更新客户端内嵌公钥并重新发版；缺签名或验签失败不会降级为未签名更新。

### 安装窗口版式

DMG 挂载后的窗口使用定制背景图（安装提示和箭头）、固定的 App 与「应用程序」图标坐标，以及卷图标。`make-dmg.sh` 先创建可读写镜像，让 Finder 写入窗口布局，再转换为压缩镜像。

背景图由 `tools/make-dmg-background.swift` 在打包时生成，配色取自 App 图标；Finder 图标坐标在 `make-dmg.sh` 中设置。

打包需要 Finder 的「自动化」权限（系统设置 → 隐私与安全性 → 自动化，允许终端控制「访达」）、Command Line Tools 提供的 `tiffutil`、`SetFile` 和 `GetFileInfo`，以及 `swift`；缺少时会中断。布局使用默认挂载点 `/Volumes/LiveWall`，同名卷已挂载时需先手动推出。卷名须保持 `LiveWall`，因为 `.DS_Store` 中的背景图引用包含该路径。调整图标坐标时，需同步修改 `make-dmg.sh` 的 `APP_ITEM_POS` / `DROP_ITEM_POS` 和背景图生成器中的对应位置。

### 发版步骤

本目录 `./build.sh`（含直接调用的 `--bump-build`）与 `./make-dmg.sh` 统一进入根脚本发布流程，每次生成新的清单加密密钥。App、`.bin`、索引及签名先暂存，核对签名、密文摘要、解密和 App 的 `keyID` 后一起晋升；构建或晋升失败时保留旧密钥与旧产物。发布构建使用同一把本机锁，避免并发生成时交叉晋升。晋升收到 `SIGINT` / `SIGTERM` 时先回滚再释放锁；若进程被强制终止，下次根构建取得锁后，会根据只记录路径的 `.livewall-promotion.json` 恢复未提交事务，或清理已提交事务的旧备份。`run.sh`、`build.sh --debug` 和 `build.sh --development` 属于开发构建，不轮换、不递增 build 号；`make-dmg.sh --no-build` 仅供发布流程内部使用。在仓库根目录构建完整发布产物：

```bash
./build.sh livewall --with-dmg
./deploy.sh studio --dry-run
./deploy.sh studio
```

换钥后新版 App 必须先联网获取对应目录，无法使用旧密钥缓存。加密只用于避免直接阅读，不作为访问控制。单独构建 App 而不带 `--with-dmg` 时，会从新部署产物中移除使用旧密钥的安装包和更新清单；需要分发时使用同批 `--with-dmg`。

根脚本按旧 App 与更新清单中的最大 build 递增必要的 `CFBundleVersion`，无 DMG 的连续发布也会递增；DMG 与版本清单及其签名放入 `build/studio.meowv.com/data/livewall/`。`CFBundleShortVersionString` 仍需人工决定；只构建 Studio 时，根脚本会保留已有更新产物。部署后应核对线上 `version.json`、`version.json.sig` 和 DMG 属于同次构建。部署前先读[根目录的发布说明](../README.md)。

发布版使用 ad-hoc 签名，未公证；其他 Mac 首次打开时可能需要在「系统设置 → 隐私与安全性」中允许该 App。
