import Foundation

/// 客户端配置。存成 JSON 而不是 UserDefaults，便于手动编辑与备份。
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
    public static let defaultRemoteCatalogURL = "https://studio.meowv.com/data/livewall/catalog.json"

    // 内容源
    /// 远程清单地址。清空则只能用远程副本缓存与内置兜底条目。
    public var remoteCatalogURL: String?

    // 节奏
    /// 自动切换间隔，单位秒。合法区间见 `SwitchInterval`（10 秒 – 24 小时），
    /// `sanitized()` 会夹紧。实际等待时长还会叠加 `jitterRatio` 的抖动。
    public var intervalSeconds: Double
    public var jitterRatio: Double
    public var switchWhenFinished: Bool
    /// 选片顺序（随机 / 顺序）。见 `PlaybackOrder`。
    public var playbackOrder: PlaybackOrder

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
    /// 内容过滤选中的一级分类 id。nil = 用清单里的默认分类。
    ///
    /// **存 id 不存分类名**：分类可能被改名或删库，id 是稳定键，name 只用于显示。
    /// 记忆值在清单里找不到时回退默认分类并**立刻写回**，否则每次启动都要重复回退一次。
    /// 只在成功取到该分类条目后才写 —— 不把一次失败的选择持久化下来。
    public var selectedCategoryID: Int?

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

    public init(
        remoteCatalogURL: String? = Preferences.defaultRemoteCatalogURL,
        intervalSeconds: Double = SchedulePolicy.defaultIntervalSeconds,
        jitterRatio: Double = SchedulePolicy.defaultJitterRatio,
        switchWhenFinished: Bool = false,
        playbackOrder: PlaybackOrder = .shuffle,
        gravity: String = "fill",
        levelPreset: LevelPreset = .recommended,
        multiScreenPolicy: MultiScreenPolicy = .mirror,
        perScreenSources: ScreenSourceStore = .empty,
        selectedCategoryID: Int? = nil,
        pauseWhenCovered: Bool = true,
        pauseWhenIdle: Bool = true,
        idleThresholdSeconds: Double = 300,
        pauseOnLowPowerMode: Bool = true,
        pauseOnBattery: Bool = false,
        pauseOnThermalPressure: Bool = true
    ) {
        self.remoteCatalogURL = remoteCatalogURL
        self.intervalSeconds = intervalSeconds
        self.jitterRatio = jitterRatio
        self.switchWhenFinished = switchWhenFinished
        self.playbackOrder = playbackOrder
        self.gravity = gravity
        self.levelPreset = levelPreset
        self.multiScreenPolicy = multiScreenPolicy
        self.perScreenSources = perScreenSources
        self.selectedCategoryID = selectedCategoryID
        self.pauseWhenCovered = pauseWhenCovered
        self.pauseWhenIdle = pauseWhenIdle
        self.idleThresholdSeconds = idleThresholdSeconds
        self.pauseOnLowPowerMode = pauseOnLowPowerMode
        self.pauseOnBattery = pauseOnBattery
        self.pauseOnThermalPressure = pauseOnThermalPressure
    }

    public static let `default` = Preferences()

    enum CodingKeys: String, CodingKey {
        case remoteCatalogURL
        case intervalSeconds, jitterRatio, switchWhenFinished, playbackOrder
        case gravity, levelPreset
        case multiScreenPolicy, perScreenSources, selectedCategoryID
        case pauseWhenCovered, pauseWhenIdle, idleThresholdSeconds
        case pauseOnLowPowerMode, pauseOnBattery, pauseOnThermalPressure
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
        intervalSeconds = try container.decodeIfPresent(Double.self, forKey: .intervalSeconds) ?? fallback.intervalSeconds
        jitterRatio = try container.decodeIfPresent(Double.self, forKey: .jitterRatio) ?? fallback.jitterRatio
        switchWhenFinished = try container.decodeIfPresent(Bool.self, forKey: .switchWhenFinished) ?? fallback.switchWhenFinished
        playbackOrder = (try? container.decodeIfPresent(PlaybackOrder.self, forKey: .playbackOrder))
            ?? fallback.playbackOrder
        gravity = try container.decodeIfPresent(String.self, forKey: .gravity) ?? fallback.gravity
        levelPreset = (try? container.decodeIfPresent(LevelPreset.self, forKey: .levelPreset)) ?? fallback.levelPreset
        multiScreenPolicy = (try? container.decodeIfPresent(MultiScreenPolicy.self, forKey: .multiScreenPolicy))
            ?? fallback.multiScreenPolicy
        perScreenSources = (try? container.decodeIfPresent(ScreenSourceStore.self, forKey: .perScreenSources))
            ?? fallback.perScreenSources
        // 手改配置把这一项写成字符串（`"selectedCategoryID": "美女"`）会抛 typeMismatch，
        // 后果与缺字段完全一样 —— 整个文件退回默认。所以同样用 `try?` 一视同仁。
        selectedCategoryID = (try? container.decodeIfPresent(Int.self, forKey: .selectedCategoryID)) ?? nil
        pauseWhenCovered = try container.decodeIfPresent(Bool.self, forKey: .pauseWhenCovered) ?? fallback.pauseWhenCovered
        pauseWhenIdle = try container.decodeIfPresent(Bool.self, forKey: .pauseWhenIdle) ?? fallback.pauseWhenIdle
        idleThresholdSeconds = try container.decodeIfPresent(Double.self, forKey: .idleThresholdSeconds) ?? fallback.idleThresholdSeconds
        pauseOnLowPowerMode = try container.decodeIfPresent(Bool.self, forKey: .pauseOnLowPowerMode) ?? fallback.pauseOnLowPowerMode
        pauseOnBattery = try container.decodeIfPresent(Bool.self, forKey: .pauseOnBattery) ?? fallback.pauseOnBattery
        pauseOnThermalPressure = try container.decodeIfPresent(Bool.self, forKey: .pauseOnThermalPressure) ?? fallback.pauseOnThermalPressure
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

    /// 读取配置。文件不存在或解析失败时返回默认值 —— 配置坏了不该让 App 起不来。
    public static func load(from url: URL) -> Preferences {
        guard let data = try? Data(contentsOf: url) else { return .default }
        guard let decoded = try? JSONDecoder().decode(Preferences.self, from: data) else {
            return .default
        }
        return decoded
    }

    public func save(to url: URL) throws {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(self).write(to: url, options: .atomic)
    }

    /// 修正非法值。配置可能被手工编辑过，不能假定它自洽。
    public func sanitized() -> Preferences {
        var copy = self
        // 超范围一律夹紧而不是退回默认：手改配置的人多半只是「填得太短/太长」，
        // 夹到最近的合法值更接近他的本意。非有限值夹不了，`SwitchInterval.clamp` 里退回默认。
        copy.intervalSeconds = SwitchInterval.clamp(copy.intervalSeconds)
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
        // 非正数的分类 id 不可能是合法分类，清掉让它走默认分类
        if let id = copy.selectedCategoryID, id <= 0 {
            copy.selectedCategoryID = nil
        }
        return copy
    }
}
