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

    /// 浮层预览区的状态。UI 只读它来决定显示播放层还是静态图。
    ///
    /// 没有「显示静态图」这一态：打开即播、不可暂停/停止，所以只会在
    /// `idle`（刚开、还没起播）/ `loading` / `playing` / `failed` 之间流转。
    enum State: Equatable {
        /// 还没有在预览任何条目（浮层刚开或已关闭）。
        case idle
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

    // 刻意**不提供** `isPlaying` / `showCover()` / `stop()` / `currentItemID`：
    // - `showCover()` 与 `stop()` 的函数体一字不差（都是 `teardownPlayer()` + 置状态）；
    // - `stop()` 唯一的调用方是「停止预览」按钮，该按钮已按需求移除（打开即播、
    //   不可暂停/停止），于是 `stop()` 与其要置的 `.cover` 状态都变成死代码；
    //   `currentItemID` 的最后一个调用方也是那个按钮；
    // - `isPlaying` 全项目用到的都是 `PlaybackState.isPlaying` / `PlaybackEngine.isPlaying`。
    // 按项目约定删掉。要看当前态就读 `state`；要结束预览就关弹窗（走 `teardown()`）。

    // MARK: - 控制

    /// 开始预览播放。由卡片双击或 Hover 预览按钮触发。
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

    /// 彻底释放（关窗口 / 关浮层）。状态回到 `.idle`。
    ///
    /// 这是**唯一**的收尾入口 —— 打开即播且不可暂停/停止，所以没有 `stop()`。
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
