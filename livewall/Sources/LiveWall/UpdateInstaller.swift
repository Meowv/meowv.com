import CryptoKit
import Foundation
import LiveWallCore

/// 把新版本 dmg 拉到下载目录 —— **到此为止，不安装**。
///
/// 为什么不直接替换 `/Applications` 里的自己：
///  1. 覆盖一个正在运行的 App 需要另一条 installer 进程（自替身 + 退出 + 落盘 + 重启），
///     那是一整套安装器，不是这个功能的体量；
///  2. 本 App 退出时要 `restoreUserWallpaper()` 把用户的原墙纸恢复回去，
///     被外部强行替换或杀掉时那一步就丢了，用户会以为壁纸被改坏；
///  3. `~/Downloads` 不需要管理员权限，装到 `/Applications` 则要弹系统认证框。
///
/// 所以这里的职责边界很清楚：**下载 + 校验 + 在 Finder 里选中**，剩下的交给用户拖。
enum UpdateInstaller {

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// dmg 比视频大、也不该被 20 秒卡住，单独放宽。
    static let downloadTimeout: TimeInterval = 60

    static func downloadsDirectory() -> URL? {
        FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
    }

    /// 下载并校验，返回落盘路径。校验不符会**把文件删掉再抛错** ——
    /// 留一个坏文件在下载目录里比没有更糟：用户会拿它去装。
    @discardableResult
    static func download(_ feed: UpdateFeed) async throws -> URL {
        guard let directory = downloadsDirectory() else {
            throw Failure(message: "找不到下载目录")
        }
        let destination = directory.appendingPathComponent(feed.suggestedFileName)

        do {
            try await FileDownloader.download(feed.fileURL, to: destination, timeout: downloadTimeout)
        } catch {
            throw Failure(message: "下载失败：\(error.localizedDescription)")
        }

        // 只在服务端给了 sha256 时才校验 —— 没给就跳过，不假装校验过。
        if feed.sha256 != nil {
            let actual: String
            do {
                actual = try sha256(of: destination)
            } catch {
                try? FileManager.default.removeItem(at: destination)
                throw Failure(message: "下载完成但无法读取校验：\(error.localizedDescription)")
            }
            guard feed.sha256Matches(actual) else {
                try? FileManager.default.removeItem(at: destination)
                throw Failure(message: "文件校验不符，已删除下载的文件")
            }
        }

        return destination
    }

    private static func sha256(of url: URL) throws -> String {
        let data = try Data(contentsOf: url)
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
