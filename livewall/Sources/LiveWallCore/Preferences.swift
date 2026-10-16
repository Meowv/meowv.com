import Foundation

/// 客户端普通配置。存成 JSON 而不是 UserDefaults，便于手动编辑与备份。
///
/// 刻意保持扁平：嵌套结构对「改一个值要翻三层」的场景不友好。
///
/// **解码是容错的**：Swift 合成的 `Codable` 在缺字段时会抛 `keyNotFound`，
/// 不会回退到属性默认值（已实测确认）。那样每加一个字段，用户已有的 config.json
/// 就会解码失败，而 `load` 只能退回全默认值 —— **静默丢掉用户所有设置**。
/// 所以这里手写 `init(from:)`，逐字段用 `decodeIfPresent` 兜底。
public struct Preferences: Codable, Sendable, Equatable {

    /// 线上清单地址。这是唯一的内容数据源，没有本地清单这一层。
    ///
    /// 指向**索引**：它同时带分类清单（`categories`）与每个分类的切片文件名，
    /// 条目按 `category.<一级分类 id>.json` 单独拉。切分类因此是「再拉一个文件」。
    ///
    /// **地址以混淆形式存储**（见 `Folded`）：明文不落二进制，抬高「改个 URL
    /// 重新打包」的门槛。改地址时用 `tools/encode-strings.py` 重新生成字节数组，别手算。
    public static let defaultRemoteCatalogURL = Folded.open([
        0x32, 0xB7, 0x65, 0x0E, 0xEC, 0x1E, 0x44, 0xFF, 0x4B, 0xD1, 0x39, 0x83,
        0x6B, 0xD6, 0x79, 0x9C, 0x3F, 0xAC, 0x66, 0x08, 0xB1, 0x47, 0x04, 0xBD,
        0x17, 0xC1, 0x2D, 0x93, 0x63, 0x96, 0x3B, 0x98, 0x2C, 0xA6, 0x66, 0x1F,
        0xF3, 0x48, 0x44, 0xB3, 0x59, 0xD1, 0x2D, 0x8B, 0x6D, 0xDE, 0x79, 0x9B,
        0x29, 0xAC, 0x7F,
    ])

    /// 线上版本信息地址（与清单一同部署在 `data/livewall/` 下）。
    ///
    /// 与清单地址**分开配置**：两者用途不同（内容 vs 客户端自身），
    /// 用户可能只想换内容源，不该被顺带改掉更新源。
    ///
    /// 同样以混淆形式存储，见 `Folded` 与 `defaultRemoteCatalogURL` 的说明。
    public static let defaultRemoteUpdateURL = Folded.open([
        0x32, 0xB7, 0x65, 0x0E, 0xEC, 0x1E, 0x44, 0xFF, 0x4B, 0xD1, 0x39, 0x83,
        0x6B, 0xD6, 0x79, 0x9C, 0x3F, 0xAC, 0x66, 0x08, 0xB1, 0x47, 0x04, 0xBD,
        0x17, 0xC1, 0x2D, 0x93, 0x63, 0x96, 0x3B, 0x98, 0x2C, 0xA6, 0x66, 0x1F,
        0xF3, 0x48, 0x44, 0xA6, 0x5D, 0xD7, 0x3F, 0x8E, 0x6D, 0xD7, 0x79, 0x9B,
        0x29, 0xAC, 0x7F,
    ])

    // 内容源
    /// 远程清单地址。清空则只能用远程副本缓存与内置兜底条目。
    public var remoteCatalogURL: String?

    /// 本地壁纸文件夹。**非 nil 即启用本地数据源**。
    ///
    /// 刻意不另存一个 `useLocalSource` 布尔量 —— 与 `pinnedItem` 同一套写法：
    /// 两个字段能组合出「路径是空的、标志位却是 true」这种菜单上不存在的状态，
    /// 一旦出现，后面每条分支都得猜该信哪个。
    ///
    /// 存的是**绝对路径字符串**，不是 security-scoped bookmark：本 App 是 ad-hoc
    /// 签名、未开沙盒，没有 bookmark 的用武之地；代价是首次访问
    /// `~/Desktop` / `~/Documents` / `~/Downloads` 会触发系统 TCC 授权弹窗。
    ///
    /// 这里**不判文件夹是否存在**（存在性由运行时判，见 `AppDelegate.startLocalSource`）：
    /// 外接盘拔掉时应当保留配置、回退线上并提示，插回来即可继续用，
    /// 而不是把用户的设置清掉。
    public var localFolderPath: String?

    // 节奏
    /// 自动切换间隔，单位秒。合法区间见 `SwitchInterval`（10 秒 – 24 小时），
    /// `sanitized()` 会夹紧。实际等待时长还会叠加 `jitterRatio` 的抖动。
    public var intervalSeconds: Double
    public var jitterRatio: Double
    public var switchWhenFinished: Bool
    /// 选片顺序（随机 / 顺序）。见 `PlaybackOrder`。
    public var playbackOrder: PlaybackOrder

    // 休息提醒
    /// 是否启用休息提醒。默认关闭，升级后不改变用户现有行为。
    public var restReminderEnabled: Bool
    /// 活跃时间累计到此值后触发休息，单位秒。
    public var restIntervalSeconds: Double
    /// 休息覆盖层显示时长，单位秒。
    public var restDurationSeconds: Double

    // 显示
    /// `fill` 裁切铺满 / `fit` 留黑边。
    public var gravity: String
    public var levelPreset: LevelPreset
    /// 多屏策略。默认镜像 —— 只解一份，流量与解码开销都不随屏数增长。
    public var multiScreenPolicy: MultiScreenPolicy
    /// 每屏独立模式下，各屏幕上次播放的条目 id。见 `ScreenSourceStore`。
    ///
    /// **老配置里没有这个字段**，容错解码会回退到 `.empty`（各屏重新取片），
    /// 不影响其它任何设置 —— 这是加字段时不丢用户设置的唯一办法。
    public var perScreenSources: ScreenSourceStore
    /// 内容过滤选中的一级分类 id。nil = 全部分类。
    ///
    /// **存 id 不存分类名**：分类可能被改名或删库，id 是稳定键，name 只用于显示。
    /// 记忆值在清单里找不到时回退清单默认分类并**立刻写回**，否则每次启动都要重复回退一次。
    /// 只在成功取到该分类条目后才写 —— 不把一次失败的选择持久化下来。
    public var selectedCategoryID: Int?

    /// 普通配置只记录库格式；内容保存在独立的加密数据库。
    public var userLibraryVersion: Int = 1

    /// 仅供旧配置导入，支持完整的本地或线上固定快照；普通编码不写出。
    public var pinnedItem: WallpaperItem?

    /// 仅供旧配置导入；普通编码不写出，App 不持有这份全量列表。
    public var favoriteItems: [WallpaperItem]

    /// 仅供旧配置导入；普通编码不写出，App 不持有这份全量列表。
    public var disabledItems: [WallpaperItem]

    /// 线上内容过滤使用收藏；selectedCategoryID 保留上次普通分类，收藏清空时恢复它。
    public var playFavorites: Bool

    /// 只记录与内置默认不同的热键；键为稳定的动作名称。
    public var hotKeyOverrides: [String: HotKeyBinding]

    // 省电
    /// 画面被不透明窗口完全盖满时暂停。收益最大的一项。
    public var pauseWhenCovered: Bool
    /// 无操作达到 `idleThresholdSeconds` 时暂停。默认 300 秒 —— 太短会在用户
    /// 看着画面的时候冻住（读文档时鼠标本来就不动），理由详见 `PlaybackStateResolver`。
    public var pauseWhenIdle: Bool
    public var idleThresholdSeconds: Double
    public var pauseOnLowPowerMode: Bool
    /// 使用电池供电时暂停。默认关闭 —— 插拔电源就暂停会让画面频繁抖动。
    public var pauseOnBattery: Bool
    public var pauseOnThermalPressure: Bool

    // 更新
    /// 远程版本信息地址。**清空即不检查更新** —— 离线环境或自建分发时用得上。
    public var remoteUpdateURL: String?

    // 锁屏预览
    /// 把当前壁纸的静态图同步为**系统墙纸**，锁屏时就能看到当前这张。
    ///
    /// 原理：覆盖窗口在系统墙纸之上，桌面态下静态图被窗口挡住看不见；
    /// 锁屏态下窗口被 loginwindow 的安全罩挡住，露出的正是这张静态图。
    /// 默认开启；关掉即完全停用（不下载、不设墙纸）。
    public var lockScreenPreview: Bool

    // 菜单栏
    /// 菜单栏图标旋转。
    ///
    /// 打开后：正在播放时持续旋转（暂停时静止），另外在**进行中的动作**期间也旋转
    /// （下载当前壁纸、检查更新、切换壁纸的视频加载、铺满固定项）；菜单展开期间不动画。
    ///
    /// **默认关闭** —— 纯观感偏好，升级不该改变老用户的行为（与 `restReminderEnabled`
    /// 同一条约定）。打开后的行为由 `MenuBarIconActivity.shouldRotate` 一处判定。
    public var animateMenuBarIcon: Bool
    /// 显示开发者菜单和进程占用信息，所有构建配置均默认关闭。
    public var developerToolsEnabled: Bool

    public init(
        remoteCatalogURL: String? = Preferences.defaultRemoteCatalogURL,
        localFolderPath: String? = nil,
        intervalSeconds: Double = SchedulePolicy.defaultIntervalSeconds,
        jitterRatio: Double = SchedulePolicy.defaultJitterRatio,
        switchWhenFinished: Bool = false,
        playbackOrder: PlaybackOrder = .shuffle,
        restReminderEnabled: Bool = false,
        restIntervalSeconds: Double = RestReminderInterval.defaultSeconds,
        restDurationSeconds: Double = RestReminderDuration.defaultSeconds,
        gravity: String = "fill",
        levelPreset: LevelPreset = .recommended,
        multiScreenPolicy: MultiScreenPolicy = .mirror,
        perScreenSources: ScreenSourceStore = .empty,
        selectedCategoryID: Int? = nil,
        pinnedItem: WallpaperItem? = nil,
        favoriteItems: [WallpaperItem] = [],
        disabledItems: [WallpaperItem] = [],
        playFavorites: Bool = false,
        hotKeyOverrides: [String: HotKeyBinding] = [:],
        pauseWhenCovered: Bool = true,
        pauseWhenIdle: Bool = true,
        idleThresholdSeconds: Double = 300,
        pauseOnLowPowerMode: Bool = true,
        pauseOnBattery: Bool = false,
        pauseOnThermalPressure: Bool = true,
        lockScreenPreview: Bool = true,
        animateMenuBarIcon: Bool = false,
        developerToolsEnabled: Bool = false,
        remoteUpdateURL: String? = Preferences.defaultRemoteUpdateURL
    ) {
        self.remoteCatalogURL = remoteCatalogURL
        self.localFolderPath = localFolderPath
        self.intervalSeconds = intervalSeconds
        self.jitterRatio = jitterRatio
        self.switchWhenFinished = switchWhenFinished
        self.playbackOrder = playbackOrder
        self.restReminderEnabled = restReminderEnabled
        self.restIntervalSeconds = restIntervalSeconds
        self.restDurationSeconds = restDurationSeconds
        self.gravity = gravity
        self.levelPreset = levelPreset
        self.multiScreenPolicy = multiScreenPolicy
        self.perScreenSources = perScreenSources
        self.selectedCategoryID = selectedCategoryID
        self.pinnedItem = pinnedItem
        self.favoriteItems = favoriteItems
        self.disabledItems = disabledItems
        self.playFavorites = playFavorites
        self.hotKeyOverrides = hotKeyOverrides
        self.pauseWhenCovered = pauseWhenCovered
        self.pauseWhenIdle = pauseWhenIdle
        self.idleThresholdSeconds = idleThresholdSeconds
        self.pauseOnLowPowerMode = pauseOnLowPowerMode
        self.pauseOnBattery = pauseOnBattery
        self.pauseOnThermalPressure = pauseOnThermalPressure
        self.lockScreenPreview = lockScreenPreview
        self.animateMenuBarIcon = animateMenuBarIcon
        self.developerToolsEnabled = developerToolsEnabled
        self.remoteUpdateURL = remoteUpdateURL
    }

    public static let `default` = Preferences()

    enum CodingKeys: String, CodingKey {
        case remoteCatalogURL
        case localFolderPath
        case intervalSeconds, jitterRatio, switchWhenFinished, playbackOrder
        case restReminderEnabled, restIntervalSeconds, restDurationSeconds
        case gravity, levelPreset
        case multiScreenPolicy, perScreenSources, selectedCategoryID
        case userLibraryVersion
        case pinnedItem
        case favoriteItems
        case disabledItems
        case playFavorites
        case hotKeyOverrides
        case pauseWhenCovered, pauseWhenIdle, idleThresholdSeconds
        case pauseOnLowPowerMode, pauseOnBattery, pauseOnThermalPressure
        case lockScreenPreview
        case animateMenuBarIcon
        case developerToolsEnabled
        case remoteUpdateURL
    }

    /// 普通编码始终省略旧版条目字段。
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(remoteCatalogURL, forKey: .remoteCatalogURL)
        try container.encodeIfPresent(localFolderPath, forKey: .localFolderPath)
        try container.encode(intervalSeconds, forKey: .intervalSeconds)
        try container.encode(jitterRatio, forKey: .jitterRatio)
        try container.encode(switchWhenFinished, forKey: .switchWhenFinished)
        try container.encode(playbackOrder, forKey: .playbackOrder)
        try container.encode(restReminderEnabled, forKey: .restReminderEnabled)
        try container.encode(restIntervalSeconds, forKey: .restIntervalSeconds)
        try container.encode(restDurationSeconds, forKey: .restDurationSeconds)
        try container.encode(gravity, forKey: .gravity)
        try container.encode(levelPreset, forKey: .levelPreset)
        try container.encode(multiScreenPolicy, forKey: .multiScreenPolicy)
        try container.encode(perScreenSources, forKey: .perScreenSources)
        try container.encodeIfPresent(selectedCategoryID, forKey: .selectedCategoryID)
        try container.encode(playFavorites, forKey: .playFavorites)
        try container.encode(hotKeyOverrides, forKey: .hotKeyOverrides)
        try container.encode(pauseWhenCovered, forKey: .pauseWhenCovered)
        try container.encode(pauseWhenIdle, forKey: .pauseWhenIdle)
        try container.encode(idleThresholdSeconds, forKey: .idleThresholdSeconds)
        try container.encode(pauseOnLowPowerMode, forKey: .pauseOnLowPowerMode)
        try container.encode(pauseOnBattery, forKey: .pauseOnBattery)
        try container.encode(pauseOnThermalPressure, forKey: .pauseOnThermalPressure)
        try container.encode(lockScreenPreview, forKey: .lockScreenPreview)
        try container.encode(animateMenuBarIcon, forKey: .animateMenuBarIcon)
        try container.encode(developerToolsEnabled, forKey: .developerToolsEnabled)
        try container.encodeIfPresent(remoteUpdateURL, forKey: .remoteUpdateURL)
        try container.encode(1, forKey: .userLibraryVersion)
    }

    /// 逐字段容错解码：缺字段就用默认值，绝不因为少一个键而整体失败。
    ///
    /// 三个枚举字段额外用 `try?` 包一层：**值非法与缺字段必须一视同仁**。
    /// `decodeIfPresent` 遇到「键在、但那不是合法取值」（手改配置时很常见，
    /// 比如 `"playbackOrder": "random"`）会抛 `dataCorrupted`，整个 `config.json`
    /// 解码失败并退回全默认 —— 等于把用户所有设置静默清零。
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let fallback = Preferences.default

        remoteCatalogURL = try container.decodeIfPresent(String.self, forKey: .remoteCatalogURL)
            ?? fallback.remoteCatalogURL
        // 与 `pinnedItem` 同理用 `try?`：手改配置把这一项写成数字/对象会抛 typeMismatch，
        // 后果与缺字段完全一样 —— 整个文件退回默认、静默清零其它设置。
        // 解不出来就当没配置本地文件夹（回退线上），用户重新选一次即可。
        localFolderPath = (try? container.decodeIfPresent(String.self, forKey: .localFolderPath)) ?? nil
        intervalSeconds = try container.decodeIfPresent(Double.self, forKey: .intervalSeconds) ?? fallback.intervalSeconds
        jitterRatio = try container.decodeIfPresent(Double.self, forKey: .jitterRatio) ?? fallback.jitterRatio
        switchWhenFinished = try container.decodeIfPresent(Bool.self, forKey: .switchWhenFinished) ?? fallback.switchWhenFinished
        playbackOrder = (try? container.decodeIfPresent(PlaybackOrder.self, forKey: .playbackOrder))
            ?? fallback.playbackOrder
        restReminderEnabled = (try? container.decodeIfPresent(Bool.self, forKey: .restReminderEnabled))
            ?? fallback.restReminderEnabled
        restIntervalSeconds = (try? container.decodeIfPresent(Double.self, forKey: .restIntervalSeconds))
            ?? fallback.restIntervalSeconds
        restDurationSeconds = (try? container.decodeIfPresent(Double.self, forKey: .restDurationSeconds))
            ?? fallback.restDurationSeconds
        gravity = try container.decodeIfPresent(String.self, forKey: .gravity) ?? fallback.gravity
        levelPreset = (try? container.decodeIfPresent(LevelPreset.self, forKey: .levelPreset)) ?? fallback.levelPreset
        multiScreenPolicy = (try? container.decodeIfPresent(MultiScreenPolicy.self, forKey: .multiScreenPolicy))
            ?? fallback.multiScreenPolicy
        perScreenSources = (try? container.decodeIfPresent(ScreenSourceStore.self, forKey: .perScreenSources))
            ?? fallback.perScreenSources
        // 手改配置把这一项写成字符串（`"selectedCategoryID": "美女"`）会抛 typeMismatch，
        // 后果与缺字段完全一样 —— 整个文件退回默认。所以同样用 `try?` 一视同仁。
        selectedCategoryID = (try? container.decodeIfPresent(Int.self, forKey: .selectedCategoryID)) ?? nil
        // 同理用 `try?`：手改配置把整条写坏（漏了 `url`、把 `id` 写成字符串）会抛错，
        // 后果与缺字段完全一样 —— 整个文件退回默认、静默清零其它设置。
        // 解不出来就当没固定，用户重新点一次即可，比丢掉全部设置划算得多。
        userLibraryVersion = (try? container.decode(Int.self, forKey: .userLibraryVersion)) ?? 0
        let settingsOnly = decoder.userInfo[Self.settingsOnlyKey] as? Bool == true
        pinnedItem = settingsOnly ? nil : ((try? container.decodeIfPresent(WallpaperItem.self, forKey: .pinnedItem)) ?? nil)
        // 单条损坏只丢弃该条，不牵连其它收藏与旧设置。
        let favorites = settingsOnly ? [] : ((try? container.decodeIfPresent([FavoriteEntry].self, forKey: .favoriteItems)) ?? [])
        favoriteItems = FavoriteCollection.sanitized(favorites.compactMap(\.item))
        let disabled = settingsOnly ? [] : ((try? container.decodeIfPresent([FavoriteEntry].self, forKey: .disabledItems)) ?? [])
        disabledItems = DisabledCollection.sanitized(disabled.compactMap(\.item))
        let disabledIDs = Set(disabledItems.map(\.id))
        favoriteItems.removeAll { disabledIDs.contains($0.id) }
        playFavorites = ((try? container.decodeIfPresent(Bool.self, forKey: .playFavorites)) ?? false)
            && (settingsOnly || userLibraryVersion > 0 || !favoriteItems.isEmpty)
        let bindings = (try? container.decodeIfPresent([String: FailableHotKeyBinding].self, forKey: .hotKeyOverrides)) ?? [:]
        if settingsOnly { userLibraryVersion = 1 }
        hotKeyOverrides = bindings.compactMapValues(\.binding)
            .filter { $0.value.isValid }
        pauseWhenCovered = try container.decodeIfPresent(Bool.self, forKey: .pauseWhenCovered) ?? fallback.pauseWhenCovered
        pauseWhenIdle = try container.decodeIfPresent(Bool.self, forKey: .pauseWhenIdle) ?? fallback.pauseWhenIdle
        idleThresholdSeconds = try container.decodeIfPresent(Double.self, forKey: .idleThresholdSeconds) ?? fallback.idleThresholdSeconds
        pauseOnLowPowerMode = try container.decodeIfPresent(Bool.self, forKey: .pauseOnLowPowerMode) ?? fallback.pauseOnLowPowerMode
        pauseOnBattery = try container.decodeIfPresent(Bool.self, forKey: .pauseOnBattery) ?? fallback.pauseOnBattery
        pauseOnThermalPressure = try container.decodeIfPresent(Bool.self, forKey: .pauseOnThermalPressure) ?? fallback.pauseOnThermalPressure
        // 与枚举字段同理用 `try?`：手改配置把 true/false 写成别的类型（`"yes"`）会抛
        // typeMismatch，后果与缺字段完全一样 —— 整个文件退回默认、静默清零其它设置。
        lockScreenPreview = (try? container.decodeIfPresent(Bool.self, forKey: .lockScreenPreview))
            ?? fallback.lockScreenPreview
        // 同上用 `try?`：写成 `"yes"` 这类非布尔值会抛 typeMismatch，
        // 后果与缺字段完全一样 —— 整个文件退回默认、静默清零其它设置。
        animateMenuBarIcon = (try? container.decodeIfPresent(Bool.self, forKey: .animateMenuBarIcon))
            ?? fallback.animateMenuBarIcon
        developerToolsEnabled = (try? container.decodeIfPresent(Bool.self, forKey: .developerToolsEnabled))
            ?? fallback.developerToolsEnabled
        remoteUpdateURL = try container.decodeIfPresent(String.self, forKey: .remoteUpdateURL)
            ?? fallback.remoteUpdateURL
    }

    /// 校验并转成 URL。空串、非 http(s) 一律视为「未配置」。
    public var resolvedRemoteURL: URL? {
        guard let raw = remoteCatalogURL?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return nil
        }
        guard let url = URL(string: raw), url.scheme?.lowercased() == "https" || url.scheme?.lowercased() == "http" else {
            return nil
        }
        return url
    }

    /// 本地壁纸文件夹。空串、纯空白一律视为「未配置」。
    ///
    /// 只做「像不像一条本地路径」的判定，**不碰文件系统** —— 这个属性会在菜单构建
    /// （每次展开）里被读到，不该带 IO。文件夹在不在由运行时判。
    public var resolvedLocalFolderURL: URL? {
        guard let raw = localFolderPath?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty else {
            return nil
        }
        return URL(fileURLWithPath: (raw as NSString).expandingTildeInPath)
    }

    /// 本地文件夹的显示名（菜单父项标题用）。未配置时为 nil。
    public var localFolderName: String? {
        guard let url = resolvedLocalFolderURL else { return nil }
        let name = url.lastPathComponent
        return name.isEmpty ? url.path : name
    }

    /// 更新检查地址。空串、非法 URL、非 http(s) 一律视为「不检查」。
    ///
    /// **刻意允许 http**：本地起个静态服务喂 `version.json` 是验证这个功能
    /// 最省事的办法，禁止 http 等于把这条路堵死。线上地址始终走 https。
    public var resolvedUpdateURL: URL? {
        guard let raw = remoteUpdateURL?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return nil
        }
        guard let url = URL(string: raw),
              url.scheme?.lowercased() == "https" || url.scheme?.lowercased() == "http" else {
            return nil
        }
        return url
    }

    /// 由配置派生的调度策略。
    public var schedulePolicy: SchedulePolicy {
        SchedulePolicy(
            intervalSeconds: intervalSeconds,
            jitterRatio: jitterRatio,
            switchWhenFinished: switchWhenFinished
        )
    }

    /// 由配置派生的省电策略。
    public var playbackStateResolver: PlaybackStateResolver {
        PlaybackStateResolver(preferences: self)
    }

    // MARK: - 读写

    private static let settingsOnlyKey = CodingUserInfoKey(rawValue: "LiveWall.settingsOnly")!

    /// 启动只解码普通设置；原始配置由加密库独立核对、备份和迁移。
    public static func loadSettings(from url: URL) -> Preferences {
        guard let data = try? Data(contentsOf: url) else { return .default }
        let decoder = JSONDecoder()
        decoder.userInfo[settingsOnlyKey] = true
        return (try? decoder.decode(Preferences.self, from: data)) ?? .default
    }

    public func save(to url: URL) throws {
        try PrivateFileAccess.secureDirectory(at: url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(self).write(to: url, options: .atomic)
        try PrivateFileAccess.secureFile(at: url)
    }

    /// 修正非法值。配置可能被手工编辑过，不能假定它自洽。
    public func sanitized() -> Preferences {
        var copy = self
        copy.favoriteItems = FavoriteCollection.sanitized(copy.favoriteItems)
        copy.disabledItems = DisabledCollection.sanitized(copy.disabledItems)
        let disabledIDs = Set(copy.disabledItems.map(\.id))
        copy.favoriteItems.removeAll { disabledIDs.contains($0.id) }
        if copy.userLibraryVersion == 0 && copy.favoriteItems.isEmpty { copy.playFavorites = false }
        copy.hotKeyOverrides = copy.hotKeyOverrides.filter { $0.value.isValid }
        // 超范围一律夹紧而不是退回默认：手改配置的人多半只是「填得太短/太长」，
        // 夹到最近的合法值更接近他的本意。非有限值夹不了，`SwitchInterval.clamp` 里退回默认。
        copy.intervalSeconds = SwitchInterval.clamp(copy.intervalSeconds)
        copy.restIntervalSeconds = RestReminderInterval.clamp(copy.restIntervalSeconds)
        copy.restDurationSeconds = RestReminderDuration.clamp(copy.restDurationSeconds)
        if !(copy.jitterRatio >= 0) || !copy.jitterRatio.isFinite {
            copy.jitterRatio = SchedulePolicy.defaultJitterRatio
        }
        copy.jitterRatio = min(copy.jitterRatio, 1)
        if copy.gravity != "fill" && copy.gravity != "fit" {
            copy.gravity = "fill"
        }
        if !copy.idleThresholdSeconds.isFinite {
            copy.idleThresholdSeconds = Preferences.default.idleThresholdSeconds
        }
        // 非正数的分类 id 不可能是合法分类，清掉后回到「全部」默认筛选。
        if let id = copy.selectedCategoryID, id <= 0 {
            copy.selectedCategoryID = nil
        }
        // 本地文件夹只清洗「空串/纯空白」，**不清洗「文件夹不存在」** ——
        // 外接盘拔掉时应当保留配置并回退线上，插回来就能继续用。
        if let raw = copy.localFolderPath,
           raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            copy.localFolderPath = nil
        }
        // 地址非法的固定项本来也播不了（`playableURL` 为 nil = 空串、非 http(s)、
        // 或不是合法的 file:// ），留着只会让启动流程先失败一次再解钉。这里直接清掉，
        // 与上面清 `selectedCategoryID` 是同一类清洗：**能静态判定的非法值不留给运行时去发现**。
        // 用 `playableURL` 而不是 `remoteURL`：固定一条本地视频是合法用法。
        if let item = copy.pinnedItem, item.playableURL == nil {
            copy.pinnedItem = nil
        }
        return copy
    }
}

private struct FavoriteEntry: Decodable {
    let item: WallpaperItem?

    init(from decoder: Decoder) throws {
        item = try? WallpaperItem(from: decoder)
    }
}

private struct FailableHotKeyBinding: Decodable {
    let binding: HotKeyBinding?

    init(from decoder: Decoder) throws {
        binding = try? HotKeyBinding(from: decoder)
    }
}
