import Foundation

/// 通用文件下载：给「锁屏预览的静态图」与「下载当前壁纸」共用。
///
/// 以流式方式写临时文件而不是 `data(for:)`：静态图实测最大 4 MB（PNG 那批），
/// 视频约 6 MB，避免把整个内容一次性放进内存，也能在超过上限时中途终止。
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

        let (bytes, response) = try await URLSession.shared.bytes(for: request)

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

        let temporaryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("livewall-download-\(UUID().uuidString)")
        guard FileManager.default.createFile(atPath: temporaryURL.path, contents: nil) else {
            throw Failure(message: "无法创建临时文件")
        }

        var file: FileHandle?
        do {
            file = try FileHandle(forWritingTo: temporaryURL)
            var buffer = Data()
            buffer.reserveCapacity(64 * 1024)
            var size: Int64 = 0
            for try await byte in bytes {
                size += 1
                guard size <= maxBytes else {
                    throw Failure(message: "文件过大：超过 \(maxBytes) 字节")
                }
                buffer.append(byte)
                if buffer.count >= 64 * 1024 {
                    try file?.write(contentsOf: buffer)
                    buffer.removeAll(keepingCapacity: true)
                }
            }
            if !buffer.isEmpty {
                try file?.write(contentsOf: buffer)
            }
            file?.closeFile()
            file = nil
            guard size > 0 else { throw Failure(message: "响应为空") }

            try FileManager.default.createDirectory(
                at: destination.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            // 覆盖式落盘：先删旧文件再移动（同一卷内 moveItem 是原子的）
            try? FileManager.default.removeItem(at: destination)
            try FileManager.default.moveItem(at: temporaryURL, to: destination)
            return size
        } catch {
            file?.closeFile()
            try? FileManager.default.removeItem(at: temporaryURL)
            if let failure = error as? Failure {
                throw failure
            }
            throw Failure(message: "写入失败：\(error.localizedDescription)")
        }
    }
}
