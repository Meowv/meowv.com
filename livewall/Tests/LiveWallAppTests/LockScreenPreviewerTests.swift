import AppKit
import LiveWallCore

/// 直接验证 App 层静态图生命周期；墙纸写入使用替身，不改用户桌面。
@main
struct LockScreenPreviewerTests {
    @MainActor static func main() async throws {
        guard !NSScreen.screens.isEmpty else { fatalError("需要 macOS 图形会话") }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        var writes: [URL] = []
        var assertions = 0
        func check(_ value: Bool, _ message: String) {
            assertions += 1
            guard value else { fatalError(message) }
        }
        let previewer = LockScreenPreviewer(cacheDirectory: directory, recordsDirectory: directory,
            setDesktopImage: { url, _ in writes.append(url) })
        let image = CGContext(data: nil, width: 4, height: 4, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!.makeImage()!
        func item(_ id: Int) -> WallpaperItem {
            WallpaperItem(id: id, title: "test", author: "", url: "file:///test.mp4")
        }
        var committed: [URL] = []
        for id in 1...3 {
            let count = writes.count
            let prepared = await previewer.prepare(for: item(id), frameProvider: { image })!
            check(writes.count == count, "准备下一张不能提前改系统墙纸")
            check(FileManager.default.fileExists(atPath: prepared.imageURL.path), "播放切换前图像已经落盘")
            check(previewer.applyPrepared(prepared, for: item(id + 10), multiScreenPolicy: .mirror) == .skipped,
                "拒绝把其他条目的图应用给当前条目")
            check(previewer.applyPrepared(prepared, for: item(id), multiScreenPolicy: .mirror) == .written,
                "切换时提交对应的图")
            committed.append(prepared.imageURL)
            previewer.discard(prepared)
            check(previewer.freezeCurrent(itemID: id, multiScreenPolicy: .mirror) == .written,
                "刚切换便退出仍有当前图")
            check(writes.last == prepared.imageURL, "退出不能回到上一张")
            previewer.reapplyCached()
            check(writes.last == prepared.imageURL, "退出重设不能回到上一张")
        }
        check(Set(committed).count == 3, "第三张不能覆盖第一张缓存 URL")

        let abandoned = await previewer.prepare(for: item(4), frameProvider: { image })!
        try await Task.sleep(for: .milliseconds(100))
        check(FileManager.default.fileExists(atPath: abandoned.imageURL.path), "后台清理保留在飞的预备图")
        previewer.discard(abandoned)
        check(previewer.freezeCurrent(itemID: 3, multiScreenPolicy: .mirror) == .written,
            "取消下一张加载后仍固化实际播放的第三张")
        check(writes.last == committed.last, "取消的预备图不能替换当前图")

        var continuation: CheckedContinuation<CGImage?, Never>?
        let pending = Task { @MainActor in
            await previewer.update(for: item(5), multiScreenPolicy: .mirror) {
                await withCheckedContinuation { continuation = $0 }
            }
        }
        while continuation == nil { await Task.yield() }
        _ = previewer.freezeCurrent(itemID: 3, multiScreenPolicy: .mirror)
        let writesAtExit = writes.count
        continuation!.resume(returning: image)
        check(await pending.value == .skipped, "退出作废在飞的旧更新")
        check(writes.count == writesAtExit, "旧更新完成不能覆盖退出固化图")
        continuation = nil
        var notices = 0
        previewer.onNotice = { _, _ in notices += 1 }
        let pendingFailure = Task { @MainActor in
            await previewer.update(for: item(7), multiScreenPolicy: .mirror) {
                await withCheckedContinuation { continuation = $0 }
            }
        }
        while continuation == nil { await Task.yield() }
        _ = previewer.freezeCurrent(itemID: 3, multiScreenPolicy: .mirror)
        continuation!.resume(returning: nil)
        check(await pendingFailure.value == .skipped, "退出作废旧更新的失败结果")
        check(notices == 0, "退出后旧失败不能弹出警告")
        let finalWriteCount = writes.count
        let failed = await previewer.prepare(for: item(6), frameProvider: { nil })
        check(failed == nil && writes.count == finalWriteCount, "准备失败保留当前图")
        try await Task.sleep(for: .milliseconds(250))
        check(FileManager.default.fileExists(atPath: committed.last!.path), "后台清理保留当前图")
        check(!FileManager.default.fileExists(atPath: committed[0].path), "后台清理移除过期图避免无限增长")
        print("LockScreenPreviewer: \(assertions) assertions passed")
    }
}
