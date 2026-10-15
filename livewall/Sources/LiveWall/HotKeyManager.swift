import Carbon.HIToolbox

/// 全局热键。
///
/// 用 Carbon 的 `RegisterEventHotKey`，**不用** `NSEvent.addGlobalMonitorForEvents`
/// —— 后者需要「辅助功能」授权（会弹窗、还要重启 App 才生效），前者零权限。
/// Carbon 在 macOS 上早已标注废弃但从未移除，它目前仍是唯一免授权的全局热键方案。
///
/// 代价是全局热键会**抢占**该组合：注册成功后其它 App 收不到这个按键。
/// 所以默认只挑不常用的 `⌥⌘` 组合，并且注册失败必须显式告知用户。
final class HotKeyManager {

    /// 一个热键定义。`keyCode` / `modifiers` 直接用 Carbon 常量。
    struct Definition: Equatable {
        let id: UInt32
        let keyCode: UInt32
        let modifiers: UInt32
        /// 菜单与日志里的展示形式，例如 `⌥⌘P`。
        let display: String
        /// 用途说明，用在「被占用」提示里 —— 只说组合名用户不知道冲突的是哪个功能。
        let purpose: String

        static let togglePause = Definition(
            id: 1,
            keyCode: UInt32(kVK_ANSI_P),
            modifiers: UInt32(cmdKey | optionKey),
            display: "⌥⌘P",
            purpose: "暂停 / 继续"
        )
        static let nextItem = Definition(
            id: 2,
            keyCode: UInt32(kVK_ANSI_N),
            modifiers: UInt32(cmdKey | optionKey),
            display: "⌥⌘N",
            purpose: "下一张"
        )
        static let reloadCatalog = Definition(
            id: 3,
            keyCode: UInt32(kVK_ANSI_R),
            modifiers: UInt32(cmdKey | optionKey),
            display: "⌥⌘R",
            // 用「内容」而不是「清单」：本地文件夹来源下这一键重扫文件夹，
            // 而「被占用」提示里写着「重新加载清单」会让人以为只跟线上清单有关。
            purpose: "重新加载内容"
        )
        static let toggleCurrentFavorite = Definition(
            id: 4,
            keyCode: UInt32(kVK_ANSI_F),
            modifiers: UInt32(cmdKey | optionKey),
            display: "⌥⌘F",
            purpose: "收藏 / 取消收藏当前壁纸"
        )
        static let toggleCurrentDisabled = Definition(
            id: 5,
            keyCode: UInt32(kVK_ANSI_X),
            modifiers: UInt32(cmdKey | optionKey),
            display: "⌥⌘X",
            purpose: "禁用 / 恢复当前壁纸"
        )

        /// 没有 `⌥⌘M 静音`：壁纸被硬性要求静音（`player.isMuted = true`），
        /// 一个永远无效的开关比没有开关更糟。
        static let all: [Definition] = [
            .togglePause, .nextItem, .reloadCatalog, .toggleCurrentFavorite, .toggleCurrentDisabled,
        ]
    }

    /// 单个热键的注册结果。
    enum Outcome: Equatable {
        case registered(Definition)
        /// 已被其它程序占用 —— 用户能自己解决（换个组合，或退掉冲突的程序）。
        case occupied(Definition, OSStatus)
        /// 其它错误 —— 用户解决不了，只能报告。
        case failed(Definition, OSStatus)

        var definition: Definition {
            switch self {
            case .registered(let definition),
                 .occupied(let definition, _),
                 .failed(let definition, _):
                return definition
            }
        }

        var isRegistered: Bool {
            if case .registered = self { return true }
            return false
        }

        /// 菜单里的一行。注册成功的只写组合，失败的写清原因。
        var summary: String {
            switch self {
            case .registered(let definition):
                return "\(definition.display) \(definition.purpose)"
            case .occupied(let definition, _):
                return "\(definition.display) \(definition.purpose) · 被占用"
            case .failed(let definition, let status):
                return "\(definition.display) \(definition.purpose) · 失败 \(status)"
            }
        }
    }

    /// `eventHotKeyExistsErr`。已实测：重复注册同一组合会拿到这个值（-9878），
    /// 因此它就是「该组合已被占用」的可靠判据。
    private static let hotKeyExistsErr: OSStatus = -9878

    /// 四字符签名，避免与其它程序的热键 id 撞车。
    private static let signature: OSType = 0x4C57_504B  // 'LWPK'

    private var handlerRef: EventHandlerRef?
    private var references: [UInt32: EventHotKeyRef] = [:]

    private(set) var outcomes: [Outcome] = []

    /// 热键触发回调（主线程）。参数是 `Definition.id`。
    var onTrigger: ((UInt32) -> Void)?

    deinit {
        unregisterAll()
    }

    // MARK: - 生命周期

    /// 注册全部默认热键。重复调用会先清理旧的，因此可安全用于「重试」。
    @discardableResult
    func registerDefaults() -> [Outcome] {
        unregisterAll()
        installHandler()

        outcomes = Definition.all.map { definition in
            var ref: EventHotKeyRef?
            let status = RegisterEventHotKey(
                definition.keyCode,
                definition.modifiers,
                EventHotKeyID(signature: Self.signature, id: definition.id),
                GetApplicationEventTarget(),
                0,
                &ref
            )
            guard status == noErr, let ref else {
                return status == Self.hotKeyExistsErr
                    ? .occupied(definition, status)
                    : .failed(definition, status)
            }
            references[definition.id] = ref
            return .registered(definition)
        }
        return outcomes
    }

    func unregisterAll() {
        for (_, ref) in references {
            UnregisterEventHotKey(ref)
        }
        references.removeAll()
        if let handlerRef {
            RemoveEventHandler(handlerRef)
            self.handlerRef = nil
        }
        outcomes.removeAll()
    }

    /// 注册失败的项。空数组表示全部成功。
    var failures: [Outcome] {
        outcomes.filter { !$0.isRegistered }
    }

    // MARK: - 内部

    private func installHandler() {
        var spec = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        // Carbon 的 C 回调不能捕获上下文，只能靠 userData 把 self 递进去。
        // `passUnretained` 在这里是安全的：manager 的生命周期长于 handler，
        // 且 `unregisterAll()` 会先 `RemoveEventHandler` 再丢弃引用。
        let context = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(
            GetApplicationEventTarget(),
            dynamicWallpaperHotKeyCallback,
            1,
            &spec,
            context,
            &handlerRef
        )
    }

    /// 供 C 回调转交。`fileprivate` 是为了让同文件的顶层回调函数够得着。
    fileprivate func handle(id: UInt32) {
        onTrigger?(id)
    }
}

/// Carbon 事件回调。必须是 C 函数（不能捕获上下文），所以放在类型外面。
private func dynamicWallpaperHotKeyCallback(
    _ callRef: EventHandlerCallRef?,
    _ event: EventRef?,
    _ userData: UnsafeMutableRawPointer?
) -> OSStatus {
    guard let event, let userData else { return OSStatus(eventNotHandledErr) }

    var identifier = EventHotKeyID()
    let status = GetEventParameter(
        event,
        EventParamName(kEventParamDirectObject),
        EventParamType(typeEventHotKeyID),
        nil,
        MemoryLayout<EventHotKeyID>.size,
        nil,
        &identifier
    )
    guard status == noErr else { return status }

    let manager = Unmanaged<HotKeyManager>.fromOpaque(userData).takeUnretainedValue()
    manager.handle(id: identifier.id)
    return noErr
}
