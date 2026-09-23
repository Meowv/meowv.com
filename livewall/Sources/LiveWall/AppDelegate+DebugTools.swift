#if DEBUG
import AppKit
import LiveWallCore

enum DebugDirectory: String {
    case logs
    case downloadedWallpapers
    case remoteDataCache
    case aerialLockScreen
}

extension AppDelegate {

    @objc func openDebugDirectory(_ sender: NSMenuItem) {
        guard let rawValue = sender.representedObject as? String,
              let directory = DebugDirectory(rawValue: rawValue) else { return }

        let url: URL
        let createIfMissing: Bool
        switch directory {
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
        case .remoteDataCache:
            url = LiveWallPaths.applicationSupportDirectory
            createIfMissing = true
        case .aerialLockScreen:
            url = aerialLockScreenManager.debugVideosDirectory
            createIfMissing = false
        }

        if createIfMissing {
            do {
                try FileManager.default.createDirectory(
                    at: url,
                    withIntermediateDirectories: true
                )
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
#endif
