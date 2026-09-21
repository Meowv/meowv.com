import AppKit
import LiveWallCore

/// 手动下载当前壁纸：视频 + 静态预览图（有就一起下）。
///
/// 落点固定 `~/Downloads/livewall/`（Finder 侧栏可见，单独子目录不污染 Downloads 根），
/// 文件名 `<id>-<清洗后的标题>.<ext>`，视频与预览图**同基名成对**便于识别。
/// 命名规则全部走 `DownloadNaming`，这里不手写第二套。
///
/// 并发约定与项目其它组件一致：**只在主线程使用**。这条约定现在由 `@MainActor` 强制
/// （Swift 6 迁移时补上）。
///
/// 注：这里此前有一条「刻意不标 `@MainActor`，标了会让 AppDelegate 里 `lazy var`
/// 的属性初始化变成跨隔离调用」的说明。那个约束只在 `AppDelegate` **没有**隔离标注时
/// 成立；`AppDelegate` 本身标了 `@MainActor` 之后它就消失了 —— 引用它的地方全在主
/// actor 上，`lazy var` 的首次求值也在主 actor 上。
///
/// 真正的重活在 `FileDownloader.download`（非隔离 async）里，所以标了
/// `@MainActor` 之后 `download` 仍是「进主线程登记状态、await 时离开主线程」，
/// 不会把逐字节下载搬到主线程上跑。
@MainActor
final class WallpaperDownloader {

    /// 下载结果，供调用方拼提示。
    struct Result {
        let files: [URL]
        /// 静态图没下成（没有地址或下载失败）—— 视频仍然保存了。
        let skippedCover: Bool
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    var log: ((String) -> Void)?

    private var isWorking = false
    private let directory: URL

    /// - Parameter directory: 默认 `~/Downloads/livewall/`。取不到 Downloads 目录时
    ///   退到临时目录 —— 不该因为找不到目录就让整个功能不可用。
    init(directory: URL? = nil) {
        if let directory {
            self.directory = directory
        } else {
            let downloads = FileManager.default
                .urls(for: .downloadsDirectory, in: .userDomainMask)
                .first ?? URL(fileURLWithPath: NSTemporaryDirectory())
            self.directory = downloads.appendingPathComponent("livewall", isDirectory: true)
        }
    }

    var isDownloading: Bool { isWorking }

    /// 下载目录（菜单提示与文档里要说明落点）。
    var destinationDirectory: URL { directory }

    /// 下载一个条目。返回 nil 表示已有下载在进行（调用方据此忽略重复点击）。
    /// 抛错表示**视频**没下成；静态图失败不算失败，只在 `Result.skippedCover` 里标记。
    func download(_ item: WallpaperItem) async throws -> Result? {
        guard !isWorking else { return nil }
        guard let videoSource = item.remoteURL else {
            throw Failure(message: "播放地址不可用")
        }
        isWorking = true
        defer { isWorking = false }

        var files: [URL] = []
        let videoExtension = DownloadNaming.fileExtension(for: videoSource, fallback: "mp4")
        let videoName = DownloadNaming.fileName(id: item.id, title: item.title, fileExtension: videoExtension)
        let videoURL = directory.appendingPathComponent(videoName)
        let videoBytes = try await FileDownloader.download(videoSource, to: videoURL, timeout: 60)
        files.append(videoURL)
        log?("下载当前壁纸：视频 \(videoName)（\(videoBytes) 字节）")

        var skippedCover = false
        if let coverSource = item.coverImageURL {
            let coverExtension = DownloadNaming.fileExtension(for: coverSource, fallback: "jpg")
            let coverName = DownloadNaming.fileName(id: item.id, title: item.title, fileExtension: coverExtension)
            let coverURL = directory.appendingPathComponent(coverName)
            do {
                let bytes = try await FileDownloader.download(
                    coverSource,
                    to: coverURL,
                    expectedContentTypePrefix: "image/"
                )
                files.append(coverURL)
                log?("下载当前壁纸：静态图 \(coverName)（\(bytes) 字节）")
            } catch {
                // 视频已经存好了，静态图失败不该让整个动作失败
                skippedCover = true
                log?("⚠️ 下载当前壁纸：静态图失败（\(error.localizedDescription)），视频已保存")
            }
        } else {
            skippedCover = true
            log?("下载当前壁纸：该条目没有静态图地址，只保存视频")
        }

        return Result(files: files, skippedCover: skippedCover)
    }
}
