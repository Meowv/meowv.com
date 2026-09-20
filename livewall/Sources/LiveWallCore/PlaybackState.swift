/// 热压力等级，与 `ProcessInfo.ThermalState` 一一对应。
/// 单独定义一份是为了让 `LiveWallCore` 不依赖 Foundation 之外的东西，也便于单测穷举。
public enum ThermalPressure: String, Codable, Sendable, CaseIterable {
    case nominal
    case fair
    case serious
    case critical

    /// 需要让出资源的等级。`fair` 属于正常波动，不处理。
    public var isConstrained: Bool {
        self == .serious || self == .critical
    }

    public var label: String {
        switch self {
        case .nominal: return "正常"
        case .fair: return "偏高"
        case .serious: return "较高"
        case .critical: return "严重"
        }
    }
}

/// 采集到的所有信号。纯数据，不含任何系统调用 —— 采集在 `PlaybackGovernor` 里做。
public struct PlaybackSignals: Equatable, Sendable {
    /// 用户手动暂停。一旦为真，状态恒为暂停，不被任何其他信号撤销。
    public var userPaused: Bool
    public var displaySleeping: Bool
    public var sessionLocked: Bool
    /// 当前屏幕被不透明窗口完全盖满 —— 收益最大的一项，因为此时画面根本看不见。
    public var screenFullyCovered: Bool
    public var thermalPressure: ThermalPressure
    public var idleSeconds: Double
    public var lowPowerMode: Bool
    /// 使用电池供电（未接电源）。
    public var onBattery: Bool

    public init(
        userPaused: Bool = false,
        displaySleeping: Bool = false,
        sessionLocked: Bool = false,
        screenFullyCovered: Bool = false,
        thermalPressure: ThermalPressure = .nominal,
        idleSeconds: Double = 0,
        lowPowerMode: Bool = false,
        onBattery: Bool = false
    ) {
        self.userPaused = userPaused
        self.displaySleeping = displaySleeping
        self.sessionLocked = sessionLocked
        self.screenFullyCovered = screenFullyCovered
        self.thermalPressure = thermalPressure
        self.idleSeconds = idleSeconds
        self.lowPowerMode = lowPowerMode
        self.onBattery = onBattery
    }
}

/// 暂停的原因。保留原因是为了在菜单里告诉用户「为什么停了」——
/// 壁纸无声无息地不动了，没有说明会让人以为程序坏了。
public enum PlaybackPauseReason: String, Equatable, Sendable, CaseIterable {
    case userRequested
    case sessionLocked
    case displaySleeping
    case screenCovered
    case thermalPressure
    case idle
    case lowPowerMode
    case onBattery

    public var label: String {
        switch self {
        case .userRequested: return "手动暂停"
        case .sessionLocked: return "屏幕已锁定"
        case .displaySleeping: return "显示器已休眠"
        case .screenCovered: return "画面被完全遮挡"
        case .thermalPressure: return "系统温度偏高"
        case .idle: return "长时间无操作"
        case .lowPowerMode: return "低电量模式"
        case .onBattery: return "使用电池供电"
        }
    }
}

public enum PlaybackState: Equatable, Sendable {
    case playing
    case paused(PlaybackPauseReason)

    public var isPlaying: Bool { self == .playing }

    public var reason: PlaybackPauseReason? {
        if case .paused(let reason) = self { return reason }
        return nil
    }

    public var label: String {
        switch self {
        case .playing: return "播放中"
        case .paused(let reason): return "已暂停（\(reason.label)）"
        }
    }
}

/// 省电策略：把一堆信号塌缩成一个状态。
///
/// **刻意只做两态**（playing / paused），不做「降帧」中间态。理由：素材是 10 秒
/// 1080p30，本身解码负担就低；降帧要靠 `AVMutableVideoComposition` 改
/// `frameDuration`，复杂度与收益不成比例。低电量场景直接暂停更省。
///
/// 判定顺序是硬约束，见 `resolve` 的注释。
public struct PlaybackStateResolver: Equatable, Sendable {

    /// 画面被完全遮挡时暂停。收益最大的一项。
    public var pauseWhenCovered: Bool
    /// 无操作超过 `idleThresholdSeconds` 时暂停。
    ///
    /// 阈值默认 **300 秒**而不是更短：读文档、盯着代码想事情的时候鼠标本来就不动，
    /// 阈值太短会让画面在用户明明看着它的时候冻住 —— 这是最容易被感知为「坏了」的一项。
    /// 5 分钟无输入基本可以认定人已离开，同时仍早于 macOS 默认的息屏时间。
    public var pauseWhenIdle: Bool
    public var idleThresholdSeconds: Double
    public var pauseOnLowPowerMode: Bool
    public var pauseOnBattery: Bool
    public var pauseOnThermalPressure: Bool

    public init(
        pauseWhenCovered: Bool = true,
        pauseWhenIdle: Bool = true,
        idleThresholdSeconds: Double = 300,
        pauseOnLowPowerMode: Bool = true,
        pauseOnBattery: Bool = false,
        pauseOnThermalPressure: Bool = true
    ) {
        self.pauseWhenCovered = pauseWhenCovered
        self.pauseWhenIdle = pauseWhenIdle
        self.idleThresholdSeconds = idleThresholdSeconds
        self.pauseOnLowPowerMode = pauseOnLowPowerMode
        self.pauseOnBattery = pauseOnBattery
        self.pauseOnThermalPressure = pauseOnThermalPressure
    }

    /// 由配置派生。
    public init(preferences: Preferences) {
        self.init(
            pauseWhenCovered: preferences.pauseWhenCovered,
            pauseWhenIdle: preferences.pauseWhenIdle,
            idleThresholdSeconds: preferences.idleThresholdSeconds,
            pauseOnLowPowerMode: preferences.pauseOnLowPowerMode,
            pauseOnBattery: preferences.pauseOnBattery,
            pauseOnThermalPressure: preferences.pauseOnThermalPressure
        )
    }

    /// 按优先级从高到低判定，返回第一个命中的原因。
    ///
    /// 顺序不能随意调换：
    /// 1. **用户手动暂停最优先**，且不被任何其他信号撤销 —— 用户说停就停；
    /// 2. 锁屏与息屏排在一起：此时画面不可见，必须停；
    /// 3. 遮挡次之：画面可见但被盖住，同样看不到，且是收益最大的一项；
    /// 4. 热压力：系统已经在挣扎，主动让出解码资源；
    /// 5. 空闲：用户离开键盘，大概率不在看；
    /// 6. 低电量模式：用户已明确表达「省电」意图；
    /// 7. 电池供电：影响最轻微，默认关闭（插拔电源就暂停会让画面频繁抖动）。
    public func resolve(_ signals: PlaybackSignals) -> PlaybackState {
        if signals.userPaused {
            return .paused(.userRequested)
        }
        if signals.sessionLocked {
            return .paused(.sessionLocked)
        }
        if signals.displaySleeping {
            return .paused(.displaySleeping)
        }
        if pauseWhenCovered, signals.screenFullyCovered {
            return .paused(.screenCovered)
        }
        if pauseOnThermalPressure, signals.thermalPressure.isConstrained {
            return .paused(.thermalPressure)
        }
        // 阈值非正数视为关闭空闲检测，避免配置写错导致刚启动就暂停
        if pauseWhenIdle, idleThresholdSeconds > 0, signals.idleSeconds >= idleThresholdSeconds {
            return .paused(.idle)
        }
        if pauseOnLowPowerMode, signals.lowPowerMode {
            return .paused(.lowPowerMode)
        }
        if pauseOnBattery, signals.onBattery {
            return .paused(.onBattery)
        }
        return .playing
    }
}

/// 空闲阈值：菜单里的预设值与文案。
///
/// 单独抽出来是为了能单测 —— 文案是用户唯一能看到的解释，
/// 「300 秒」显示成「5 分钟」还是「300 秒」直接影响可读性。
public enum IdleThreshold {

    /// 菜单提供的预设，单位秒。
    public static let presets: [Double] = [60, 300, 600, 1800]

    /// 人读文案。文案规则与「切换间隔」共用 `DurationText`，避免两处各写一套后漂移。
    /// 这里的 `nil` 落到「关闭」—— 空闲阈值取 0 的语义就是关掉这项。
    public static func label(_ seconds: Double) -> String {
        DurationText.concise(seconds, fallback: "关闭")
    }
}

