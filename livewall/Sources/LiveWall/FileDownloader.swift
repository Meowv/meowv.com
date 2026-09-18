import Foundation

/// 通用文件下载：给「锁屏预览的静态图」与「下载当前壁纸」共用。
///
/// 用 `URLSession.download(for:)` 而不是 `data(for:)`：静态图实测最大 4 MB（PNG 那批），
/// 视频约 6 MB，落临时文件再移动可以避免整个内容进内存。
enum FileDownloader {

    /// 单次下载上限。静态图实测最大 4 MB、视频约 6 MB，留足余量后卡在 64 MB ——
    /// 挡住「清单里混进一个超大文件」把磁盘写满。
    static let maxBytes: Int64 = 64 * 1024 * 1024

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// 下载到 `destination`（覆盖已存在的文件）。目标目录不存在会自动创建。
    ///
    /// - Parameter expectedContentTypePrefix: 例如 `"image/"`；给了就校验 MIME，
    ///   挡住「CDN 把错误页当图片返回」这种会把坏内容写成墙纸的情况。
    /// - Returns: 落盘字节数。
    @discardableResult
    static func download(
        _ url: URL,
        to destination: URL,
        timeout: TimeInterval = 20,
        expectedContentTypePrefix: String? = nil
    ) async throws -> Int64 {
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadRevalidatingCacheData

        let (temporaryURL, response) = try await URLSession.shared.download(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw Failure(message: "响应不是 HTTP")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw Failure(message: "HTTP \(http.statusCode)")
        }
        if let expectedContentTypePrefix,
           let mime = http.mimeType,
           !mime.lowercased().hasPrefix(expectedContentTypePrefix.lowercased()) {
            throw Failure(message: "内容类型不符：\(mime)")
        }

        let size = fileSize(temporaryURL)
        guard size > 0 else { throw Failure(message: "响应为空") }
        guard size <= maxBytes else { throw Failure(message: "文件过大：\(size) 字节") }

        try FileManager.default.createDirectory(
            at: destination.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        // 覆盖式落盘：先删旧文件再移动（同一卷内 moveItem 是原子的）
        try? FileManager.default.removeItem(at: destination)
        do {
            try FileManager.default.moveItem(at: temporaryURL, to: destination)
        } catch {
            throw Failure(message: "写入失败：\(error.localizedDescription)")
        }
        return size
    }

    private static func fileSize(_ url: URL) -> Int64 {
        ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber)?.int64Value ?? 0
    }
}
