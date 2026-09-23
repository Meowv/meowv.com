import Foundation

/// 通用文件下载：给「锁屏预览的静态图」与「下载当前壁纸」共用。
///
/// 以流式方式写临时文件而不是 `data(for:)`：静态图实测最大 4 MB（PNG 那批），
/// 视频约 6 MB，避免把整个内容一次性放进内存，也能在超过上限时中途终止。
enum FileDownloader {

    /// 单次下载的**默认**上限。静态图实测最大 4 MB、视频约 6 MB，留足余量后卡在 64 MB ——
    /// 挡住「清单里混进一个超大文件」把磁盘写满。
    ///
    /// dmg 走单独的上限（见 `UpdateInstaller.downloadMaxBytes`）：三类内容的合理上限
    /// 差两个数量级，共用一个常量会让「dmg 长到 64 MB 以上」变成一次莫名其妙的
    /// 「文件过大：超过 67108864 字节」失败，排障时不容易联想到是共用上限。
    static let defaultMaxBytes: Int64 = 64 * 1024 * 1024

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// 下载到 `destination`（覆盖已存在的文件）。目标目录不存在会自动创建。
    ///
    /// - Parameters:
    ///   - expectedContentTypePrefix: 例如 `"image/"`；给了就校验 MIME，
    ///     挡住「CDN 把错误页当图片返回」这种会把坏内容写成墙纸的情况。
    ///   - maxBytes: 字节上限，**边下边判**，超过即中止并抛错。
    ///     这里刻意保留「流式截断」能力：换成 `download(for:)` 会先把整包写盘、
    ///     只能事后检查大小，上限就退化成一个事后告警。
    /// - Returns: 落盘字节数。
    @discardableResult
    static func download(
        _ url: URL,
        to destination: URL,
        timeout: TimeInterval = 20,
        expectedContentTypePrefix: String? = nil,
        maxBytes: Int64 = FileDownloader.defaultMaxBytes
    ) async throws -> Int64 {
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadRevalidatingCacheData

        return try await ChunkedDownload(
            request: request,
            destination: destination,
            expectedContentTypePrefix: expectedContentTypePrefix,
            maxBytes: maxBytes
        ).run()
    }
}

/// 一次分块下载。`URLSessionDataDelegate` 直接交付 `Data`，避免
/// `AsyncBytes` 的逐字节 Swift 迭代；同时在响应头和每个分块处检查大小上限。
private final class ChunkedDownload: NSObject, URLSessionDataDelegate, @unchecked Sendable {

    private let request: URLRequest
    private let destination: URL
    private let expectedContentTypePrefix: String?
    private let maxBytes: Int64

    private let lock = NSLock()
    private var continuation: CheckedContinuation<Int64, Error>?
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var temporaryURL: URL?
    private var fileHandle: FileHandle?
    private var receivedBytes: Int64 = 0
    private var settled = false
    private var cancelRequested = false

    init(
        request: URLRequest,
        destination: URL,
        expectedContentTypePrefix: String?,
        maxBytes: Int64
    ) {
        self.request = request
        self.destination = destination
        self.expectedContentTypePrefix = expectedContentTypePrefix
        self.maxBytes = maxBytes
    }

    func run() async throws -> Int64 {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let directory = destination.deletingLastPathComponent()
                let temporaryURL = directory.appendingPathComponent(
                    ".livewall-download-\(UUID().uuidString).part"
                )
                do {
                    try FileManager.default.createDirectory(
                        at: directory,
                        withIntermediateDirectories: true
                    )
                    guard FileManager.default.createFile(atPath: temporaryURL.path, contents: nil) else {
                        throw FileDownloader.Failure(message: "无法创建临时文件")
                    }
                } catch {
                    continuation.resume(throwing: normalized(error))
                    return
                }

                lock.lock()
                if cancelRequested {
                    lock.unlock()
                    try? FileManager.default.removeItem(at: temporaryURL)
                    continuation.resume(throwing: CancellationError())
                    return
                }
                self.continuation = continuation
                self.temporaryURL = temporaryURL

                let configuration = URLSessionConfiguration.default
                let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
                let task = session.dataTask(with: request)
                self.session = session
                self.task = task
                lock.unlock()

                task.resume()
            }
        } onCancel: {
            cancel()
        }
    }

    private func cancel() {
        lock.lock()
        cancelRequested = true
        let task = self.task
        lock.unlock()
        task?.cancel()
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        guard !isSettled else {
            completionHandler(.cancel)
            return
        }
        guard let http = response as? HTTPURLResponse else {
            finish(.failure(FileDownloader.Failure(message: "响应不是 HTTP")))
            completionHandler(.cancel)
            return
        }
        guard (200..<300).contains(http.statusCode) else {
            finish(.failure(FileDownloader.Failure(message: "HTTP \(http.statusCode)")))
            completionHandler(.cancel)
            return
        }
        if let expectedContentTypePrefix,
           let mime = http.mimeType,
           !mime.lowercased().hasPrefix(expectedContentTypePrefix.lowercased())
        {
            finish(.failure(FileDownloader.Failure(message: "内容类型不符：\(mime)")))
            completionHandler(.cancel)
            return
        }
        if response.expectedContentLength > 0, response.expectedContentLength > maxBytes {
            finish(.failure(FileDownloader.Failure(message: "文件过大：超过 \(maxBytes) 字节")))
            completionHandler(.cancel)
            return
        }

        do {
            guard let temporaryURL else {
                throw FileDownloader.Failure(message: "下载临时文件已丢失")
            }
            fileHandle = try FileHandle(forWritingTo: temporaryURL)
            completionHandler(.allow)
        } catch {
            finish(.failure(normalized(error)))
            completionHandler(.cancel)
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard !isSettled else { return }
        receivedBytes += Int64(data.count)
        guard receivedBytes <= maxBytes else {
            finish(.failure(FileDownloader.Failure(message: "文件过大：超过 \(maxBytes) 字节")))
            dataTask.cancel()
            return
        }
        do {
            try fileHandle?.write(contentsOf: data)
        } catch {
            finish(.failure(normalized(error)))
            dataTask.cancel()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            finish(.failure(normalized(error)))
            return
        }
        guard receivedBytes > 0 else {
            finish(.failure(FileDownloader.Failure(message: "响应为空")))
            return
        }
        finish(.success(receivedBytes))
    }

    private var isSettled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return settled
    }

    private func finish(_ result: Result<Int64, Error>) {
        lock.lock()
        guard !settled else {
            lock.unlock()
            return
        }
        settled = true
        let continuation = self.continuation
        self.continuation = nil
        let session = self.session
        self.session = nil
        let temporaryURL = self.temporaryURL
        self.temporaryURL = nil
        let handle = fileHandle
        fileHandle = nil
        lock.unlock()

        try? handle?.close()
        session?.finishTasksAndInvalidate()

        let finalResult: Result<Int64, Error>
        switch result {
        case .success(let size):
            do {
                guard let temporaryURL else {
                    throw FileDownloader.Failure(message: "下载临时文件已丢失")
                }
                // 临时文件与目标同目录，使用文件系统替换保留旧文件直到新文件就位。
                if FileManager.default.fileExists(atPath: destination.path) {
                    _ = try FileManager.default.replaceItemAt(destination, withItemAt: temporaryURL)
                } else {
                    try FileManager.default.moveItem(at: temporaryURL, to: destination)
                }
                finalResult = .success(size)
            } catch {
                if let temporaryURL {
                    try? FileManager.default.removeItem(at: temporaryURL)
                }
                finalResult = .failure(normalized(error))
            }
        case .failure(let error):
            if let temporaryURL {
                try? FileManager.default.removeItem(at: temporaryURL)
            }
            finalResult = .failure(error)
        }

        continuation?.resume(with: finalResult)
    }

    private func normalized(_ error: Error) -> Error {
        if error is CancellationError || (error as? URLError)?.code == .cancelled {
            return CancellationError()
        }
        return error
    }
}
