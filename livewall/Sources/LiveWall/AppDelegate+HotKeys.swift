import AppKit
import LiveWallCore

extension AppDelegate {
    @objc func openHotKeySettings() {
        guard !backupOperationPending, !isShuttingDown else { return }
        if let existing = hotKeySettingsWindowController {
            existing.present()
            return
        }
        let controller = HotKeySettingsWindowController(manager: hotKeys)
        controller.onChange = { [weak self] definition, binding in
            self?.changeHotKey(definition, to: binding)
        }
        controller.onClose = { [weak self] in
            self?.hotKeySettingsWindowController = nil
        }
        hotKeySettingsWindowController = controller
        controller.present()
    }

    func changeHotKey(_ definition: HotKeyManager.Definition, to binding: HotKeyBinding) -> String? {
        guard !backupOperationPending, !isShuttingDown else { return "正在备份或恢复，请稍后重试" }
        let failure = hotKeys.rebind(definition, to: binding) {
            let previous = preferences.hotKeyOverrides
            if binding == definition.binding {
                preferences.hotKeyOverrides.removeValue(forKey: definition.key)
            } else {
                preferences.hotKeyOverrides[definition.key] = binding
            }
            guard persistPreferences("快捷键设置") else {
                preferences.hotKeyOverrides = previous
                return false
            }
            return true
        }
        if let failure {
            log("⚠️ 快捷键设置失败：\(definition.purpose)：\(failure)")
        } else {
            log("快捷键设置：\(definition.purpose) → \(binding.display)")
        }
        refreshStatusItem()
        return failure
    }
}
