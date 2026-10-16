import AppKit
import LiveWallCore

enum DebugDirectory: String {
    case configuration
    case logs
    case downloadedWallpapers
    case updatePackages
    case remoteDataCache
    case aerialLockScreen
}

extension AppDelegate {

    @objc func toggleDeveloperTools() {
        preferences.developerToolsEnabled.toggle()
        persistPreferences("开发者工具开关")
        configureDeveloperTools()
        let state = preferences.developerToolsEnabled ? "开启" : "关闭"
        notice = .info("开发者工具已\(state)", oneShot: true)
        log("开发者工具 → \(state)")
        refreshStatusItem()
    }

    func configureDeveloperTools(sinceLaunch: Bool = false) {
        processMonitor?.cancel()
        processMonitor = nil
        sampledThisOpen = false
        usageReport = nil
        usageFailed = false
        guard preferences.developerToolsEnabled else { return }
        let monitor = ProcessMonitor()
        monitor.prepareBaseline(sinceLaunch: sinceLaunch)
        processMonitor = monitor
    }

    @objc func openDebugDirectory(_ sender: NSMenuItem) {
        guard preferences.developerToolsEnabled,
              let rawValue = sender.representedObject as? String,
              let directory = DebugDirectory(rawValue: rawValue) else { return }

        let url: URL
        let createIfMissing: Bool
        switch directory {
        case .configuration:
            url = configURL.deletingLastPathComponent()
            createIfMissing = true
        case .logs:
            guard let logFileURL = LiveWallPaths.logFileURL else {
                showDebugDirectoryFailure("无法定位日志目录")
                return
            }
            url = logFileURL.deletingLastPathComponent()
            createIfMissing = true
        case .downloadedWallpapers:
            url = downloader.destinationDirectory
            createIfMissing = true
        case .updatePackages:
            guard let downloads = UpdateInstaller.downloadsDirectory() else {
                showDebugDirectoryFailure("无法定位更新包下载目录")
                return
            }
            url = downloads
            createIfMissing = true
        case .remoteDataCache:
            url = LiveWallPaths.dataCacheDirectory
            createIfMissing = true
        case .aerialLockScreen:
            url = aerialLockScreenManager.debugVideosDirectory
            createIfMissing = false
        }

        if createIfMissing {
            do {
                if directory == .configuration || directory == .remoteDataCache || directory == .logs {
                    try PrivateFileAccess.secureDirectory(at: url)
                } else {
                    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
                }
            } catch {
                showDebugDirectoryFailure("无法创建目录：\(error.localizedDescription)")
                return
            }
        } else if !FileManager.default.fileExists(atPath: url.path) {
            showDebugDirectoryFailure("系统 Aerial 目录不存在，请先在系统设置下载一张动态墙纸")
            return
        }

        guard NSWorkspace.shared.open(url) else {
            showDebugDirectoryFailure("Finder 无法打开：\(url.path)")
            return
        }
        log("已在 Finder 打开目录：\(url.path)")
    }

    private func showDebugDirectoryFailure(_ message: String) {
        notice = .warning(message)
        log("⚠️ \(message)")
        refreshStatusItem()
    }
}
