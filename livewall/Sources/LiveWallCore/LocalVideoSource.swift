import Foundation

/// 本地文件夹数据源：把一个文件夹里的 mp4 变成可播放条目。
///
/// ## 为什么 id 必须由路径派生
///
/// 失效黑名单（`CandidatePool.blacklist(id:)`）与每屏源记忆
/// （`Preferences.perScreenSources`）都按 `id` 记，而且都要**跨重启**生效。
/// 若拿数组下标当 id，用户往文件夹里加一个文件就会让后面所有 id 错位 ——
/// 表现成「上次那块屏播的片子变成了另一条」，且看不出是 id 的问题。
/// 所以 id 取**绝对路径的稳定哈希**：同一个文件在任何一次扫描里都是同一个 id。
///
/// 哈希必须是**跨进程稳定**的算法。Swift 的 `Hashable` 每进程随机加盐
/// （`Hasher` 的种子每次启动都不同），拿它当持久化 id 等于每次重启都换一套 id。
/// 这里用 FNV-1a 64 位：纯算术、无随机、无依赖。
public enum LocalVideoSource {

    /// 扫描失败的原因。文案直接给用户看，所以写中文。
    public enum SourceError: Error, LocalizedError, Equatable, Sendable {
        /// 路径不存在，或存在但不是文件夹。
        case notDirectory(String)
        /// 目录枚举失败（权限、IO 等）。
        case unreadable(String)
        /// 递归扫完一个 mp4 都没有。
        case noMP4Files(String)

        public var errorDescription: String? {
            switch self {
            case .notDirectory(let path): return "不是一个文件夹：\(path)"
            case .unreadable(let detail): return "文件夹无法读取：\(detail)"
            case .noMP4Files(let path): return "文件夹里没有 mp4 文件：\(path)"
            }
        }
    }

    /// 收集文件夹里的 mp4（**递归**子文件夹），按绝对路径排序。
    ///
    /// 排序是必需的，不是洁癖：顺序模式（`PlaybackOrder.sequential`）直接照候选集的
    /// 次序播，次序若随枚举顺序漂移，同一个文件夹每次启动的播放序列都不一样。
    /// 只收集 `.mp4`（大小写不敏感），其它扩展名一律忽略 —— 与「该文件夹内必须均为
    /// mp4」的口径一致：非 mp4 不是错误，只是不参与播放。
    public static func items(in folder: URL, fileManager: FileManager = .default) throws -> [WallpaperItem] {
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: folder.path, isDirectory: &isDirectory) else {
            throw SourceError.notDirectory(folder.path)
        }
        guard isDirectory.boolValue else { throw SourceError.notDirectory(folder.path) }

        let urls = try mp4URLs(in: folder, fileManager: fileManager)
        guard !urls.isEmpty else { throw SourceError.noMP4Files(folder.path) }

        var used = Set<Int>()
        return urls.map { url in
            let id = stableID(for: url, excluding: used)
            used.insert(id)
            return WallpaperItem(
                id: id,
                // 本地文件没有作者与静态图，也不做分类 —— 这些字段留空而不是伪造。
                title: url.deletingPathExtension().lastPathComponent,
                author: "",
                url: url.absoluteString
            )
        }
    }

    /// 递归找出全部 mp4 文件（已标准化路径、已排序）。
    ///
    /// 跳过隐藏项与包内容：`.DS_Store` 之类不该进列表，`.app` / `.photoslibrary`
    /// 这些包内部的东西更不该被当成片库。
    public static func mp4URLs(in folder: URL, fileManager: FileManager = .default) throws -> [URL] {
        guard let enumerator = fileManager.enumerator(
            at: folder,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else {
            throw SourceError.unreadable(folder.path)
        }

        var found: [URL] = []
        for case let url as URL in enumerator where isMP4(url) {
            // 名为 `xxx.mp4` 的**目录**也要排除：枚举器会把它交出来。
            let isRegular = try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile
            if isRegular == false { continue }
            found.append(url.standardizedFileURL)
        }
        return found.sorted { $0.path < $1.path }
    }

    /// 是否是 mp4。大小写不敏感 —— 相机与手机导出的文件名常见 `.MP4`。
    public static func isMP4(_ url: URL) -> Bool {
        url.pathExtension.lowercased() == "mp4"
    }

    /// 路径 → 稳定 id。`used` 里的值会被避开（哈希冲突时线性探测 +1）。
    public static func stableID(for url: URL, excluding used: Set<Int> = []) -> Int {
        var candidate = positiveID(for: url.standardizedFileURL.path)
        while used.contains(candidate) {
            candidate = candidate == Int.max ? 1 : candidate + 1
        }
        return candidate
    }

    /// FNV-1a 64 位，映射到 `1...Int.max`。
    ///
    /// 刻意避开 0：候选池与状态区都有「没有正在播放的条目」这类语义，
    /// 留一个不可能出现的 0 当哨兵比事后排查「id 为 0 的那条到底是哪条」省事。
    static func positiveID(for path: String) -> Int {
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in path.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x0000_0100_0000_01b3
        }
        return Int(hash % UInt64(Int.max - 1)) + 1
    }
}
