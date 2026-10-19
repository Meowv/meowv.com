import Carbon.HIToolbox
import AppKit
import LiveWallCore

/// 全局热键。
///
/// 用 Carbon 的 `RegisterEventHotKey`，**不用** `NSEvent.addGlobalMonitorForEvents`
/// —— 后者需要「辅助功能」授权（会弹窗、还要重启 App 才生效），前者零权限。
/// Carbon 在 macOS 上早已标注废弃但从未移除，它目前仍是唯一免授权的全局热键方案。
///
/// 非独占注册允许其它 App 同时接收相同组合，不能据成功注册断言没有外部冲突。
/// 所以默认只挑不常用的 `⌥⌘` 组合，并且注册失败必须显式告知用户。
final class HotKeyManager {

    /// 动作身份稳定；绑定可以从配置覆盖。
    struct Definition: Equatable {
        let id: UInt32
        let key: String
        let binding: HotKeyBinding
        let purpose: String

        var display: String { binding.display }

        func with(binding: HotKeyBinding) -> Definition {
            Definition(id: id, key: key, binding: binding, purpose: purpose)
        }

        static let togglePause = Definition(
            id: 1,
            key: "togglePause",
            binding: HotKeyBinding(key: "P", modifiers: HotKeyBinding.command | HotKeyBinding.option),
            purpose: "暂停 / 继续"
        )
        static let nextItem = Definition(
            id: 2,
            key: "nextItem",
            binding: HotKeyBinding(key: "N", modifiers: HotKeyBinding.command | HotKeyBinding.option),
            purpose: "下一张"
        )
        static let reloadCatalog = Definition(
            id: 3,
            key: "reloadCatalog",
            binding: HotKeyBinding(key: "R", modifiers: HotKeyBinding.command | HotKeyBinding.option),
            // 用「内容」而不是「清单」：本地文件夹来源下这一键重扫文件夹，
            // 而「被占用」提示里写着「重新加载清单」会让人以为只跟线上清单有关。
            purpose: "重新加载内容"
        )
        static let toggleCurrentFavorite = Definition(
            id: 4,
            key: "toggleCurrentFavorite",
            binding: HotKeyBinding(key: "F", modifiers: HotKeyBinding.command | HotKeyBinding.option),
            purpose: "收藏 / 取消收藏当前壁纸"
        )
        static let toggleCurrentDisabled = Definition(
            id: 5,
            key: "toggleCurrentDisabled",
            binding: HotKeyBinding(key: "X", modifiers: HotKeyBinding.command | HotKeyBinding.option),
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
        /// 与本程序的其它动作重复。
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
                return "\(definition.display) \(definition.purpose) · 重复"
            case .failed(let definition, let status):
                return "\(definition.display) \(definition.purpose) · 失败 \(status)"
            }
        }
    }

    /// 注册失败不能证明其它应用占用：非独占模式允许多个应用监听同一组合。
    private static let hotKeyExistsErr: OSStatus = -9878

    /// 四字符签名，避免与其它程序的热键 id 撞车。
    private static let signature: OSType = 0x4C57_504B  // 'LWPK'

    private var handlerRef: EventHandlerRef?
    private var references: [UInt32: EventHotKeyRef] = [:]

    private(set) var outcomes: [Outcome] = []
    private var definitions = Definition.all

    /// 热键触发回调（主线程）。参数是 `Definition.id`。
    var onTrigger: ((UInt32) -> Void)?

    deinit {
        unregisterAll()
    }

    // MARK: - 生命周期

    static let keyCodes: [String: UInt32] = [
        "A": UInt32(kVK_ANSI_A), "B": UInt32(kVK_ANSI_B), "C": UInt32(kVK_ANSI_C),
        "D": UInt32(kVK_ANSI_D), "E": UInt32(kVK_ANSI_E), "F": UInt32(kVK_ANSI_F),
        "G": UInt32(kVK_ANSI_G), "H": UInt32(kVK_ANSI_H), "I": UInt32(kVK_ANSI_I),
        "J": UInt32(kVK_ANSI_J), "K": UInt32(kVK_ANSI_K), "L": UInt32(kVK_ANSI_L),
        "M": UInt32(kVK_ANSI_M), "N": UInt32(kVK_ANSI_N), "O": UInt32(kVK_ANSI_O),
        "P": UInt32(kVK_ANSI_P), "Q": UInt32(kVK_ANSI_Q), "R": UInt32(kVK_ANSI_R),
        "S": UInt32(kVK_ANSI_S), "T": UInt32(kVK_ANSI_T), "U": UInt32(kVK_ANSI_U),
        "V": UInt32(kVK_ANSI_V), "W": UInt32(kVK_ANSI_W), "X": UInt32(kVK_ANSI_X),
        "Y": UInt32(kVK_ANSI_Y), "Z": UInt32(kVK_ANSI_Z),
        "0": UInt32(kVK_ANSI_0), "1": UInt32(kVK_ANSI_1), "2": UInt32(kVK_ANSI_2),
        "3": UInt32(kVK_ANSI_3), "4": UInt32(kVK_ANSI_4), "5": UInt32(kVK_ANSI_5),
        "6": UInt32(kVK_ANSI_6), "7": UInt32(kVK_ANSI_7), "8": UInt32(kVK_ANSI_8),
        "9": UInt32(kVK_ANSI_9),
    ]

    private static let keysByCode = Dictionary(uniqueKeysWithValues: keyCodes.map { ($0.value, $0.key) })

    static func binding(for event: NSEvent) -> HotKeyBinding? {
        guard let key = keysByCode[UInt32(event.keyCode)] else { return nil }
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        var modifiers: UInt8 = 0
        if flags.contains(.command) { modifiers |= HotKeyBinding.command }
        if flags.contains(.option) { modifiers |= HotKeyBinding.option }
        if flags.contains(.control) { modifiers |= HotKeyBinding.control }
        if flags.contains(.shift) { modifiers |= HotKeyBinding.shift }
        let binding = HotKeyBinding(key: key, modifiers: modifiers)
        return binding.isValid ? binding : nil
    }

    func display(for definition: Definition) -> String {
        definitions.first { $0.id == definition.id }?.display ?? definition.display
    }

    /// 启动时按配置注册；坏组合退回默认，重复组合仅使后一个动作不可用。
    @discardableResult
    func register(overrides: [String: HotKeyBinding]) -> [Outcome] {
        unregisterAll()
        installHandler()
        definitions = Definition.all.map { definition in
            let binding = overrides[definition.key].flatMap { $0.isValid ? $0 : nil } ?? definition.binding
            return definition.with(binding: binding)
        }

        var seen = Set<HotKeyBinding>()
        outcomes = definitions.map { definition in
            guard seen.insert(definition.binding).inserted else {
                return .occupied(definition, Self.hotKeyExistsErr)
            }
            var ref: EventHotKeyRef?
            let status = RegisterEventHotKey(
                Self.keyCodes[definition.binding.key]!,
                Self.carbonModifiers(definition.binding.modifiers),
                EventHotKeyID(signature: Self.signature, id: definition.id),
                GetApplicationEventTarget(),
                0,
                &ref
            )
            guard status == noErr, let ref else {
                return .failed(definition, status)
            }
            references[definition.id] = ref
            return .registered(definition)
        }
        return outcomes
    }

    /// 新组合先注册、持久化成功后再释放旧组合；失败时旧组合保持可用。
    func rebind(
        _ original: Definition,
        to binding: HotKeyBinding,
        persist: () -> Bool
    ) -> String? {
        guard binding.isValid, let code = Self.keyCodes[binding.key],
              let index = definitions.firstIndex(where: { $0.id == original.id })
        else { return "不支持这个快捷键组合" }
        guard !definitions.contains(where: { $0.id != original.id && $0.binding == binding }) else {
            return "该组合已分配给其它操作"
        }
        let old = definitions[index]
        let oldRef = references[original.id]
        if old.binding == binding, oldRef != nil {
            return persist() ? nil : "快捷键未能保存，原组合保持不变"
        }

        var newRef: EventHotKeyRef?
        let status = RegisterEventHotKey(
            code, Self.carbonModifiers(binding.modifiers),
            EventHotKeyID(signature: Self.signature, id: original.id),
            GetApplicationEventTarget(), 0, &newRef
        )
        guard status == noErr, let newRef else {
            return "系统无法注册 \(binding.display)（\(status)），原组合保持不变"
        }
        guard persist() else {
            UnregisterEventHotKey(newRef)
            return "快捷键未能保存，原组合保持不变"
        }
        if let oldRef { UnregisterEventHotKey(oldRef) }
        let updated = original.with(binding: binding)
        references[original.id] = newRef
        definitions[index] = updated
        outcomes[index] = .registered(updated)
        return nil
    }

    private static func carbonModifiers(_ modifiers: UInt8) -> UInt32 {
        var result: UInt32 = 0
        if modifiers & HotKeyBinding.command != 0 { result |= UInt32(cmdKey) }
        if modifiers & HotKeyBinding.option != 0 { result |= UInt32(optionKey) }
        if modifiers & HotKeyBinding.control != 0 { result |= UInt32(controlKey) }
        if modifiers & HotKeyBinding.shift != 0 { result |= UInt32(shiftKey) }
        return result
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
