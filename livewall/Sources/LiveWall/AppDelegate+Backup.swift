import AppKit
import Darwin
import LiveWallCore
import UniformTypeIdentifiers

extension AppDelegate {
    static let backupContentType = UTType(exportedAs: "com.meowv.livewall.backup", conformingTo: .data)

    var backupRestoreService: BackupRestoreService {
        BackupRestoreService(directory: LiveWallPaths.applicationSupportDirectory)
    }

    func buildBackupMenu() -> NSMenuItem {
        let root = NSMenuItem(title: backupOperationPending ? "备份与恢复（处理中…）" : "备份与恢复", action: nil, keyEquivalent: "")
        let menu = NSMenu()
        for (title, action) in [("创建备份…", #selector(createBackup)), ("从备份恢复…", #selector(restoreBackup))] {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
            item.target = self
            menu.addItem(item)
        }
        root.submenu = menu
        return root
    }

    private func beginBackupOperation() -> Bool {
        guard hasExclusiveInstanceLock, !backupOperationPending, !isShuttingDown,
              !backupRestoreService.hasPendingRestore else { return false }
        backupOperationPending = true
        hotKeySettingsWindowController?.close()
        browserWindowController?.refreshPinState()
        refreshStatusItem()
        return true
    }

    private func finishBackupOperation() {
        backupOperationPending = false
        backupTask = nil
        browserWindowController?.refreshDisabledState()
        refreshStatusItem()
    }

    @objc func createBackup() {
        guard libraryReady, beginBackupOperation() else { return }
        NSApp.activate(ignoringOtherApps: true)
        let panel = NSSavePanel()
        panel.title = "创建 LiveWall 备份"
        panel.message = "备份包含设置、收藏、禁用与固定壁纸，不包含视频。持有备份文件即可恢复。"
        panel.allowedContentTypes = [Self.backupContentType]
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        panel.nameFieldStringValue = "LiveWall-\(formatter.string(from: Date())).\(BackupArchive.fileExtension)"
        guard panel.runModal() == .OK, let url = panel.url else { finishBackupOperation(); return }
        backupTask = Task { @MainActor in
            defer { finishBackupOperation() }
            do {
                if let pending = libraryMutationTask { await pending.value }
                try Task.checkCancellation()
                guard !isShuttingDown, let wallpaperLibrary else { return }
                persistScreenSources()
                let settings = preferences
                let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "开发版"
                let snapshot = try await wallpaperLibrary.exportSnapshot()
                try Task.checkCancellation()
                try await Task.detached(priority: .userInitiated) {
                    let archive = try BackupArchive(preferences: settings, snapshot: snapshot, appVersion: version)
                    _ = try await archive.validate()
                    try archive.write(to: url)
                }.value
                guard !isShuttingDown else { return }
                let alert = NSAlert()
                alert.messageText = "备份已保存"
                alert.informativeText = "持有备份文件即可恢复，请妥善保管。"
                alert.addButton(withTitle: "完成")
                alert.addButton(withTitle: "在访达中显示")
                if alert.runModal() == .alertSecondButtonReturn {
                    NSWorkspace.shared.activateFileViewerSelecting([url])
                }
            } catch is CancellationError {
                return
            } catch { showBackupFailure("创建备份失败", error: error) }
        }
    }

    @objc func restoreBackup() {
        guard beginBackupOperation() else { return }
        NSApp.activate(ignoringOtherApps: true)
        let panel = NSOpenPanel()
        panel.title = "从 LiveWall 备份恢复"
        panel.allowedContentTypes = [Self.backupContentType]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        guard panel.runModal() == .OK, let url = panel.url else { finishBackupOperation(); return }
        backupTask = Task { @MainActor in
            defer { finishBackupOperation() }
            do {
                if let pending = libraryMutationTask { await pending.value }
                try Task.checkCancellation()
                let (archive, summary) = try await Task.detached(priority: .userInitiated) {
                    let archive = try BackupArchive.read(from: url)
                    return (archive, try await archive.validate())
                }.value
                try Task.checkCancellation()
                guard !isShuttingDown else { return }
                let alert = NSAlert()
                alert.alertStyle = .warning
                alert.messageText = "替换当前数据并重启？"
                let date = DateFormatter.localizedString(from: archive.createdAt, dateStyle: .medium, timeStyle: .short)
                alert.informativeText = "备份时间：\(date)\n收藏：\(summary.favoriteCount) 条；禁用：\(summary.disabledCount) 条；固定壁纸：\(summary.hasPinnedItem ? "有" : "无")\n\n将整体替换设置与个人条目，并自动重启。恢复前会在用户数据目录的 Backups 中自动保存当前数据；视频与本机系统墙纸恢复记录不受替换。"
                alert.addButton(withTitle: "恢复并重启")
                alert.addButton(withTitle: "取消")
                guard alert.runModal() == .alertFirstButtonReturn else { return }
                try await backupRestoreService.stage(archive)
                try Task.checkCancellation()
                guard !isShuttingDown else { return }
                shutdown()
                if let wallpaperLibrary { await wallpaperLibrary.close() }
                restartAfterRestore()
            } catch is CancellationError {
                return
            } catch { showBackupFailure("恢复准备失败", error: error) }
        }
    }

    private func restartAfterRestore() {
        guard let executable = Bundle.main.executableURL?.path else {
            showRestartFailure()
            return
        }
        // 替换本进程，避免延时启动子进程与实例锁的竞态；锁在 exec 时由内核关闭。
        let arguments = [executable] + CommandLine.arguments.dropFirst()
        let pointers = arguments.map { strdup($0) }
        defer { pointers.forEach { free($0) } }
        var argv = pointers + [nil]
        argv.withUnsafeMutableBufferPointer { buffer in _ = execv(executable, buffer.baseAddress!) }
        showRestartFailure()
    }

    private func showRestartFailure() {
        let alert = NSAlert()
        alert.messageText = "恢复已准备，自动重启失败"
        alert.informativeText = "请重新打开 LiveWall 完成恢复，现有数据尚未替换。"
        alert.runModal()
        NSApp.terminate(nil)
    }

    private func showBackupFailure(_ title: String, error: Error) {
        guard !isShuttingDown else { return }
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title
        alert.informativeText = AppLog.sanitize(error.localizedDescription)
        alert.runModal()
    }

    func showRestoreOutcome(_ outcome: BackupRestoreService.Outcome) {
        guard !isShuttingDown else { return }
        let alert = NSAlert()
        alert.messageText = outcome.restored ? "备份恢复完成" : "恢复未完成，已回退原数据"
        alert.informativeText = "恢复前的数据已保存在：\n\(outcome.backupDirectory.path)\n\n可使用其中的 before-restore.livewallbackup 恢复；原数据损坏时保留 original.plist 原始副本。"
        alert.addButton(withTitle: "完成")
        alert.addButton(withTitle: "显示自动备份")
        if alert.runModal() == .alertSecondButtonReturn { NSWorkspace.shared.open(outcome.backupDirectory) }
        startupRestoreOutcome = nil
    }
}
