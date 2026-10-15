import AppKit
import Carbon.HIToolbox
import LiveWallCore

private final class HotKeySettingsWindow: NSWindow {
    var captureKeyEquivalent: ((NSEvent) -> Bool)?

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if captureKeyEquivalent?(event) == true { return true }
        return super.performKeyEquivalent(with: event)
    }
}

private final class HotKeyCaptureButton: NSButton {
    var isRecording = false
    var onCapture: ((HotKeyBinding) -> Void)?
    var onCancel: (() -> Void)?

    override var acceptsFirstResponder: Bool { true }
    override var canBecomeKeyView: Bool { true }

    override func keyDown(with event: NSEvent) {
        guard isRecording else {
            super.keyDown(with: event)
            return
        }
        capture(event)
    }

    func capture(_ event: NSEvent) {
        if event.keyCode == UInt16(kVK_Escape) {
            isRecording = false
            onCancel?()
            return
        }
        guard let binding = HotKeyManager.binding(for: event) else {
            NSSound.beep()
            return
        }
        isRecording = false
        onCapture?(binding)
    }
}

/// 菜单栏 App 的快捷键编辑窗口；只负责录入，注册与保存由 AppDelegate 落实。
final class HotKeySettingsWindowController: NSWindowController, NSWindowDelegate {
    var onChange: ((HotKeyManager.Definition, HotKeyBinding) -> String?)?
    var onClose: (() -> Void)?

    private let manager: HotKeyManager
    private var buttons: [String: HotKeyCaptureButton] = [:]

    init(manager: HotKeyManager) {
        self.manager = manager
        let window = HotKeySettingsWindow(
            contentRect: NSRect(x: 0, y: 0, width: 500, height: 300),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "快捷键设置"
        window.minSize = NSSize(width: 460, height: 280)
        window.isReleasedWhenClosed = false
        window.center()
        super.init(window: window)
        window.delegate = self
        window.captureKeyEquivalent = { [weak self] event in
            guard let button = self?.buttons.values.first(where: \.isRecording) else { return false }
            button.capture(event)
            return true
        }
        buildContent(in: window)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("不支持从 nib 加载", file: "", line: 0) }

    func present() {
        guard let window else { return }
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        if #available(macOS 14.0, *) {
            NSApp.activate()
        } else {
            NSApp.activate(ignoringOtherApps: true)
        }
        DispatchQueue.main.async { [weak window] in window?.orderFrontRegardless() }
    }

    private func buildContent(in window: NSWindow) {
        guard let root = window.contentView else { return }
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 9
        stack.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(stack)

        for definition in HotKeyManager.Definition.all {
            let row = NSStackView()
            row.orientation = .horizontal
            row.alignment = .centerY
            row.spacing = 12

            let label = NSTextField(labelWithString: definition.purpose)
            label.lineBreakMode = .byTruncatingTail
            label.widthAnchor.constraint(equalToConstant: 220).isActive = true
            row.addArrangedSubview(label)

            let button = HotKeyCaptureButton()
            button.title = manager.display(for: definition)
            button.bezelStyle = .rounded
            button.toolTip = "字母或数字，加 ⌘ 或 ⌃（可再组合其它修饰键）；Esc 取消"
            button.target = self
            button.action = #selector(beginRecording(_:))
            button.widthAnchor.constraint(equalToConstant: 145).isActive = true
            button.onCapture = { [weak self] binding in
                self?.apply(binding, for: definition)
            }
            button.onCancel = { [weak self] in self?.refreshButtons() }
            row.addArrangedSubview(button)
            buttons[definition.key] = button

            let reset = NSButton()
            reset.title = ""
            reset.image = NSImage(
                systemSymbolName: "arrow.counterclockwise",
                accessibilityDescription: "恢复默认"
            )
            reset.imagePosition = .imageOnly
            reset.bezelStyle = .rounded
            reset.toolTip = "恢复\(definition.purpose)的默认快捷键"
            reset.target = self
            reset.action = #selector(resetBinding(_:))
            reset.tag = Int(definition.id)
            reset.widthAnchor.constraint(equalToConstant: 30).isActive = true
            row.addArrangedSubview(reset)
            stack.addArrangedSubview(row)
        }

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: root.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: root.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: root.leadingAnchor, constant: 18),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: root.trailingAnchor, constant: -18),
        ])
    }

    @objc private func beginRecording(_ sender: HotKeyCaptureButton) {
        for button in buttons.values { button.isRecording = false }
        refreshButtons()
        sender.isRecording = true
        sender.title = "录入中…"
        window?.makeFirstResponder(sender)
    }

    @objc private func resetBinding(_ sender: NSButton) {
        guard let definition = HotKeyManager.Definition.all.first(where: { $0.id == UInt32(sender.tag) })
        else { return }
        for button in buttons.values { button.isRecording = false }
        apply(definition.binding, for: definition)
    }

    private func apply(_ binding: HotKeyBinding, for definition: HotKeyManager.Definition) {
        if let failure = onChange?(definition, binding) {
            let alert = NSAlert()
            alert.messageText = "快捷键未更改"
            alert.informativeText = failure
            if let window { alert.beginSheetModal(for: window) }
        }
        refreshButtons()
    }

    private func refreshButtons() {
        for definition in HotKeyManager.Definition.all {
            buttons[definition.key]?.title = manager.display(for: definition)
        }
    }

    func windowWillClose(_ notification: Notification) {
        onClose?()
    }
}
