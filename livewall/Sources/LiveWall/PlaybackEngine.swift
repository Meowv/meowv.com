import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

/// 播放引擎：一个 `AVQueuePlayer` 挂在所有覆盖窗口上（P1 的「全部同片」模式）。
///
/// 为什么 P1 只用单播放器：多屏同时解码同一段视频，共享一个播放器最省资源。
/// 每屏独立选片是 P4 的多屏策略，届时这里会改成按窗口持有播放器。
final class PlaybackEngine {

    private let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?
    private var statusObservation: NSKeyValueObservation?

    private(set) var currentItem: WallpaperItem?
    private(set) var currentDuration: Double?

    /// 播放失败时回调。传原始 `Error` 而不是字符串 —— 调用方需要按错误类型
    /// 区分「资源坏了」和「网络不通」，前者拉黑，后者不能拉黑。
    var onFailure: ((Error) -> Void)?

    init() {
        player.isMuted = true
        // 壁纸不该阻止显示器休眠
        player.preventsDisplaySleepDuringVideoPlayback = false
        player.actionAtItemEnd = .advance
    }

    // MARK: - 窗口绑定

    func attach(to windows: [DesktopOverlayWindow], gravity: AVLayerVideoGravity) {
        for window in windows {
            window.attach(player: player, gravity: gravity)
        }
    }

    // MARK: - 播放

    /// 切换到指定条目。调用方应已完成准入校验（`VideoLoader.load`）。
    func play(_ item: WallpaperItem, loaded: LoadedVideo) {
        currentItem = item
        currentDuration = loaded.durationSeconds

        // 先拆旧的 looper 并清空队列，否则旧内容可能继续播放
        statusObservation = nil
        looper?.disableLooping()
        looper = nil
        player.removeAllItems()

        // 复用 VideoLoader 已经建好的 asset，不要再 AVPlayerItem(url:) 新建一个 ——
        // 那样会把同一个文件拉第二遍（实测 6.28MB 的视频变成 12.55MB 流量）。
        let playerItem = AVPlayerItem(asset: loaded.asset)
        // 让播放器尽量整段缓冲：10 秒的片段可以整段驻留，循环才稳
        playerItem.preferredForwardBufferDuration = min(loaded.durationSeconds, 30)

        statusObservation = playerItem.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard item.status == .failed, let error = item.error else { return }
            DispatchQueue.main.async { self?.onFailure?(error) }
        }

        looper = AVPlayerLooper(player: player, templateItem: playerItem)
        player.play()
    }

    func pause() {
        player.pause()
    }

    func resume() {
        player.play()
    }

    var isPlaying: Bool { player.rate > 0 }

    func teardown() {
        statusObservation = nil
        looper?.disableLooping()
        looper = nil
        player.removeAllItems()
        player.pause()
    }
}
