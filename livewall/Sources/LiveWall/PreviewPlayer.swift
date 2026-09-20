import AppKit
import AVFoundation
import LiveWallCore

/// 以 `AVPlayerLayer` 为 backing layer 的视图。预览画面画在它上面。
///
/// 直接把 `layer` 换成 `AVPlayerLayer`（而不是 `addSublayer`）：后者要自己管
/// 子图层的 frame 与 `contentsScale`，窗口缩放时会露出没跟上的黑边。
final class PreviewLayerView: NSView {

    private let playerLayer = AVPlayerLayer()

    init() {
        super.init(frame: .zero)
        wantsLayer = true
        playerLayer.videoGravity = .resizeAspect
        playerLayer.backgroundColor = NSColor.black.cgColor
        layer = playerLayer
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("不支持从 nib 加载") }

    var player: AVPlayer? {
        get { playerLayer.player }
        set { playerLayer.player = newValue }
    }
}

/// 右栏内联预览的播放器。
///
/// ## 与桌面播放器的关系
///
/// **两个完全独立的 `AVPlayer`**，同一个视频会有第二次下载。这是「用户主动点了预览」
/// 才发生的代价 —— 默认只显示静态图（决策 4），不点就不花这份流量。
///
/// 刻意**不暂停桌面播放**（决策 12）：预览是「挑一张」的辅助动作，
/// 不该把正在看的壁纸弄停。
///
/// 并发约定与项目其它组件一致：**只在主线程使用**。
final class PreviewPlayer {

    /// 右栏预览区的状态。UI 只读它来决定显示静态图、播放层还是「资源不可用」。
    enum State: Equatable {
        /// 还没选任何条目。
        case idle
        /// 选中了条目、显示静态图（**默认状态**）。
        case cover
        /// 正在做准入校验与建播放器。
        case loading(Int)
        /// 正在循环播放。
        case playing(Int)
        /// 加载失败，`String` 是给用户看的原因。
        case failed(Int, String)
    }

    private(set) var state: State = .idle {
        didSet {
            guard state != oldValue else { return }
            onStateChange?(state)
        }
    }

    /// 状态变化回调（主线程）。
    var onStateChange: ((State) -> Void)?
    var log: ((String) -> Void)?

    /// 画面视图。由 `WallpaperBrowserViewController` 放进右栏，与静态图叠放。
    let view = PreviewLayerView()

    private var queuePlayer: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var loadTask: Task<Void, Never>?
    /// 代次：切条目 / 停预览 / 关窗口都会递增，让在飞的加载结果作废 ——
    /// 否则「点了 A 又点 B」会出现 A 的加载完成后把 B 的画面顶掉。
    private var generation = 0

    /// 当前预览的条目 id。`nil` 表示没在预览。
    var currentItemID: Int? {
        switch state {
        case .loading(let id), .playing(let id), .failed(let id, _): return id
        case .idle, .cover: return nil
        }
    }

    var isPlaying: Bool {
        if case .playing = state { return true }
        return false
    }

    // MARK: - 控制

    /// 选中一个条目：回到静态图状态（**不自动播放**）。
    func showCover() {
        teardownPlayer()
        state = .cover
    }

    /// 开始预览播放。只有用户点了「预览」才会调到这里。
    func play(_ item: WallpaperItem) {
        teardownPlayer()
        guard let url = item.remoteURL else {
            state = .failed(item.id, "资源不可用")
            log?("预览失败 \(item.id)：播放地址不可用")
            return
        }

        generation += 1
        let generation = self.generation
        state = .loading(item.id)

        loadTask = Task { @MainActor in
            do {
                let loaded = try await VideoLoader.load(url)
                guard generation == self.generation else {
                    self.log?("预览 \(item.id) 的加载结果已过期，丢弃")
                    return
                }
                let player = AVQueuePlayer()
                player.isMuted = true
                // 预览不该阻止显示器休眠 —— 它只是右栏里的一小块画面。
                player.preventsDisplaySleepDuringVideoPlayback = false
                player.actionAtItemEnd = .advance

                // 复用 `VideoLoader` 建好的 asset，不再 `AVPlayerItem(url:)` 新建 ——
                // 那样会把同一个文件拉第二遍。
                let playerItem = AVPlayerItem(asset: loaded.asset)
                playerItem.preferredForwardBufferDuration = min(loaded.durationSeconds, 30)

                self.looper = AVPlayerLooper(player: player, templateItem: playerItem)
                self.queuePlayer = player
                self.view.player = player
                player.play()
                self.state = .playing(item.id)
                self.log?("预览播放 \(item.id) \(item.title)（\(loaded.resolutionText)，"
                    + "\(String(format: "%.2f", loaded.durationSeconds))s）")
            } catch {
                guard generation == self.generation else { return }
                self.state = .failed(item.id, "资源不可用")
                self.log?("预览失败 \(item.id)：\(error.localizedDescription)")
            }
        }
    }

    /// 停止预览。切条目、关窗口都走这里。
    ///
    /// 状态回到 `.cover` 而不是 `.idle`：调用方（VC）紧接着会调 `showCover()` 或
    /// 重新 `play()`，`.cover` 是「还选着这条、只是没在播」的正确语义。
    func stop() {
        teardownPlayer()
        state = .cover
    }

    /// 彻底释放（关窗口）。与 `stop()` 的区别：状态回到 `.idle`。
    func teardown() {
        teardownPlayer()
        state = .idle
    }

    private func teardownPlayer() {
        generation += 1
        loadTask?.cancel()
        loadTask = nil
        looper?.disableLooping()
        looper = nil
        queuePlayer?.removeAllItems()
        queuePlayer?.pause()
        queuePlayer = nil
        // 摘掉播放器引用，`AVPlayerLayer` 才会释放解码器。
        view.player = nil
    }
}
