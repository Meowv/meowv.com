import AVFoundation
import AppKit
import LiveWallCore
import LiveWallDesktop

/// 播放槽位的标识。
///
/// 镜像与仅主屏共用一个 `.shared`（只解一份）；每屏独立时按 `displayID` 各开一个。
///
/// **用 displayID 而不是窗口对象做 key**：屏幕热插拔时窗口会被整体重建，
/// 用窗口做 key 会让「这块屏刚才播的是什么」跟着窗口一起丢掉。
enum PlaybackSlotKey: Hashable, Sendable {
    case shared
    case display(UInt32)

    /// 日志与状态区里的名字。
    var label: String {
        switch self {
        case .shared: return "共用"
        case .display(let id): return "屏\(id)"
        }
    }

    /// 槽位对应的屏幕。共用槽位没有 —— 它不属于任何一块屏，
    /// 所以「每屏的源记忆」那套逻辑对它自然不适用。
    var displayID: UInt32? {
        guard case .display(let id) = self else { return nil }
        return id
    }
}

/// 播放缓冲与抓帧的资源上限。
///
/// 这些值不是播放协议的一部分，只用于避免常驻菜单栏应用在多槽位 / 锁屏预览时
/// 无界地放大解码缓冲与静态帧。10 秒覆盖当前素材的常见时长，AVFoundation 仍会
/// 根据实际网络状况自行调整。
enum PlaybackTuning {
    static let forwardBufferCap: TimeInterval = 10
}

/// 播放引擎：持有若干**播放槽位**，每个槽位一个 `AVQueuePlayer`。
///
/// 多槽位是为「每屏独立」服务的：镜像与仅主屏只用一个 `.shared` 槽位，
/// 所有窗口挂同一个 player —— 多屏同时解码同一段视频，共享一个播放器最省资源。
/// 每屏独立时按屏幕各开一个槽位，代价是解码路数与流量按屏数翻倍
/// （上限见 `MultiScreenPolicy.maxIndependentScreens`）。
///
/// **`@MainActor`**：槽位状态、KVO 与失败通知都在主 actor 上处理；
/// 取帧通过 `AVAssetImageGenerator` 异步完成，不会自旋主 run loop。
@MainActor
final class PlaybackEngine {

    /// 一个播放槽位：一个独立的播放器 + 循环器 + 当前条目。
    ///
    /// 单独标 `@MainActor`：**嵌套类型不继承外层类型的全局 actor 隔离**
    /// （已实测确认），而它要被主 actor 上的 `@Sendable` 闭包捕获，
    /// 不标的话编译器会认为它可能被跨线程访问。
    @MainActor
    private final class Slot {
        let player = AVQueuePlayer()
        var looper: AVPlayerLooper?
        var looperStatusObservation: NSKeyValueObservation?
        var failureObserver: NSObjectProtocol?
        var item: WallpaperItem?
        var loadedVideo: LoadedVideo?
        var duration: Double?
        var playbackGeneration = 0
        var didReportFailure = false
        var cachedStillFrame: CGImage?
        var frameTask: Task<Void, Never>?

        init() {
            player.isMuted = true
            // 壁纸不该阻止显示器休眠
            player.preventsDisplaySleepDuringVideoPlayback = false
            player.actionAtItemEnd = .advance
        }

        func teardown() {
            frameTask?.cancel()
            frameTask = nil
            cachedStillFrame = nil
            loadedVideo = nil
            looperStatusObservation = nil
            if let failureObserver {
                NotificationCenter.default.removeObserver(failureObserver)
                self.failureObserver = nil
            }
            playbackGeneration += 1
            looper?.disableLooping()
            looper = nil
            player.removeAllItems()
            player.pause()
        }
    }

    private var slots: [PlaybackSlotKey: Slot] = [:]
    /// 槽位的创建顺序。第 0 个是主槽位 —— 状态区显示它，也由它排下一次切换。
    private var keyOrder: [PlaybackSlotKey] = []

    /// 播放失败时回调。**带上槽位**：每屏独立时一次失败只影响一个槽位，
    /// 不能因为副屏挂了就把主屏也停掉。
    var onFailure: ((PlaybackSlotKey, Error) -> Void)?
    /// 任一槽位的播放器更换视频后通知观察者（休息层复用同一个 AVPlayer）。
    var onPlaybackChange: (() -> Void)?

    // MARK: - 槽位管理

    /// 把播放端对齐到给定的槽位集合。
    ///
    /// 不在新集合里的槽位会被拆掉（释放解码器），保留下来的槽位**不动** ——
    /// 屏幕热插拔不该让没变化的那块屏重新拉一遍视频。
    func useSlots(_ keys: [PlaybackSlotKey]) {
        // 先收集再删：遍历 `slots.keys` 的同时改字典会直接崩（Dictionary was mutated）。
        let stale = slots.keys.filter { !keys.contains($0) }
        for key in stale {
            slots[key]?.teardown()
            slots[key] = nil
        }
        keyOrder = keys
        for key in keys where slots[key] == nil {
            slots[key] = Slot()
        }
    }

    /// 当前槽位，按主次顺序。
    func slotKeys() -> [PlaybackSlotKey] { keyOrder }

    /// 主槽位。状态区显示它，下一次切换由它排期。
    var primaryKey: PlaybackSlotKey? { keyOrder.first }

    func item(on key: PlaybackSlotKey) -> WallpaperItem? { slots[key]?.item }
    func loadedVideo(on key: PlaybackSlotKey) -> LoadedVideo? { slots[key]?.loadedVideo }
    func player(on key: PlaybackSlotKey) -> AVPlayer? { slots[key]?.player }

    /// 主槽位的时长 —— 调度下一次切换用。
    ///
    /// 只有主槽位排定时器：多槽位各排一个会互相覆盖 `scheduleTimer`，
    /// 结果就是切换节奏变成「最后一个加载完的说了算」。
    var primaryDuration: Double? {
        keyOrder.first.flatMap { slots[$0]?.duration }
    }

    /// 是否还没有任何槽位成功播放过内容。
    var isEmpty: Bool {
        keyOrder.allSatisfy { slots[$0]?.item == nil }
    }

    // MARK: - 窗口绑定

    /// 把窗口挂到指定槽位上。重复调用会替换旧图层。
    func attach(_ window: DesktopOverlayWindow, to key: PlaybackSlotKey, gravity: AVLayerVideoGravity) {
        guard let slot = slots[key] else { return }
        window.attach(player: slot.player, gravity: gravity)
    }

    // MARK: - 播放

    /// 切换到指定条目。调用方应已完成准入校验（`VideoLoader.load`）。
    func play(
        _ item: WallpaperItem,
        loaded: LoadedVideo,
        on key: PlaybackSlotKey,
        captureStillFrame: Bool = false
    ) {
        guard let slot = slots[key] else { return }
        slot.item = item
        slot.loadedVideo = loaded
        slot.duration = loaded.durationSeconds
        slot.playbackGeneration += 1
        let playbackGeneration = slot.playbackGeneration
        slot.didReportFailure = false
        slot.cachedStillFrame = nil
        slot.frameTask?.cancel()
        slot.frameTask = nil

        // 先拆旧的 looper 并清空队列，否则旧内容可能继续播放
        slot.looperStatusObservation = nil
        if let failureObserver = slot.failureObserver {
            NotificationCenter.default.removeObserver(failureObserver)
            slot.failureObserver = nil
        }
        slot.looper?.disableLooping()
        slot.looper = nil
        slot.player.removeAllItems()

        // 复用 VideoLoader 已经建好的 asset，不要再 AVPlayerItem(url:) 新建一个 ——
        // 那样会把同一个文件拉第二遍（实测 6.28MB 的视频变成 12.55MB 流量）。
        let playerItem = AVPlayerItem(asset: loaded.asset)
        // 给循环播放留出一段缓冲，但不再按 30 秒上限无条件放大常驻内存。
        // 每屏独立时这份缓冲仍按槽位数增加，因此上限集中在 PlaybackTuning 管理。
        playerItem.preferredForwardBufferDuration = min(
            loaded.durationSeconds,
            PlaybackTuning.forwardBufferCap
        )

        // AVPlayerLooper 会复制 template item，template 的 KVO 状态不代表实际播放的副本。
        // 监听 looper 自身状态，并同时接收每个副本的失败通知。
        slot.looper = AVPlayerLooper(player: slot.player, templateItem: playerItem)
        if let looper = slot.looper {
            slot.looperStatusObservation = looper.observe(\.status, options: [.new]) { [weak self, weak slot] observed, _ in
                // KVO 闭包是**非隔离**的，而 `AVPlayerLooper` 不是 Sendable ——
                // 直接把它或它的 `status` 递过去都是跨线程读同一个对象。
                // 所以这里只递一个 `ObjectIdentifier`（Sendable 的值），
                // 「状态是不是 failed、错在哪」全部回主 actor 再读。
                let observedID = ObjectIdentifier(observed)
                Task { @MainActor [weak self, weak slot] in
                    guard let self, let slot,
                          let live = slot.looper,
                          ObjectIdentifier(live) == observedID,
                          live.status == .failed
                    else { return }
                    let error = live.error ?? NSError(
                        domain: "LiveWall.Playback",
                        code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "AVPlayerLooper 播放失败"]
                    )
                    self.reportFailure(key: key, error: error, slot: slot, generation: playbackGeneration)
                }
            }
        }
        slot.failureObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: nil,
            queue: .main
        ) { [weak self, weak slot] notification in
            // 同上：`Notification` 与 `AVPlayerItem` 都不是 Sendable。
            // 只把失败项的 `ObjectIdentifier` 递过去，主 actor 上再用它去认领
            // —— 归属判定与错误内容都在那边读。
            guard let failed = notification.object as? AVPlayerItem else { return }
            let failedID = ObjectIdentifier(failed)
            Task { @MainActor [weak self, weak slot] in
                guard let self, let slot, slot.playbackGeneration == playbackGeneration else { return }
                let owner = [slot.player.currentItem]
                    .compactMap { $0 }
                    .first { ObjectIdentifier($0) == failedID }
                    ?? slot.looper?.loopingPlayerItems.first { ObjectIdentifier($0) == failedID }
                guard let item = owner else { return }
                let error = item.error ?? NSError(
                    domain: "LiveWall.Playback",
                    code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "AVPlayerItem 播放失败"]
                )
                self.reportFailure(key: key, error: error, slot: slot, generation: playbackGeneration)
            }
        }
        slot.player.play()
        if captureStillFrame {
            scheduleStillFrameCapture(for: slot, key: key, generation: playbackGeneration)
        }
        onPlaybackChange?()
    }

    /// 上报一次槽位播放失败。**调用方必须已经在主 actor 上**。
    ///
    /// 这里刻意**不再自己 hop 回主线程**（旧实现用 `DispatchQueue.main.async`）：
    /// 两个调用方（KVO 与失败通知）现在都是先回主 actor 再调进来，
    /// 再 hop 一次只会让「这次失败已经报过」的判定时刻与调用时刻错开。
    private func reportFailure(
        key: PlaybackSlotKey,
        error: Error,
        slot: Slot?,
        generation: Int
    ) {
        guard let slot,
              slot.playbackGeneration == generation,
              !slot.didReportFailure
        else { return }
        slot.didReportFailure = true
        onFailure?(key, error)
    }

    func pause() {
        for slot in slots.values { slot.player.pause() }
    }

    func resume() {
        for slot in slots.values { slot.player.play() }
    }

    var isPlaying: Bool { slots.values.contains { $0.player.rate > 0 } }

    // MARK: - 取帧

    /// 取指定槽位**当前显示帧**。取不到返回 nil —— 调用方保留旧图，绝不清空墙纸。
    ///
    /// 播放开始后会自动异步缓存一帧；这里优先返回缓存。缓存缺失时才用
    /// `AVAssetImageGenerator` 补抓。生成器复用播放器已建好的 asset，
    /// 实测不会产生额外流量，也不会阻塞主 run loop。
    /// 异步生成槽位当前帧。生成器自身异步执行，不占用主线程；结果只回主 actor 缓存。
    func currentFrame(on key: PlaybackSlotKey) async -> CGImage? {
        guard let slot = slots[key] else { return nil }
        if let cached = slot.cachedStillFrame { return cached }

        let generation = slot.playbackGeneration
        guard let item = slot.player.currentItem else { return nil }
        let currentTime = item.currentTime()
        let frame = await Self.generateFrame(
            asset: item.asset,
            at: currentTime.isValid ? currentTime : .zero,
            maximumSize: Self.maximumStillFrameSize()
        )
        guard slot.playbackGeneration == generation else { return nil }
        slot.cachedStillFrame = frame
        return frame
    }

    private func scheduleStillFrameCapture(
        for slot: Slot,
        key: PlaybackSlotKey,
        generation: Int
    ) {
        slot.frameTask = Task { @MainActor [weak self, weak slot] in
            // 给播放器一点时间拿到首批可显示帧，同时完全不阻塞主 actor。
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled, let self, let slot else { return }
            guard slot.playbackGeneration == generation else { return }
            _ = await self.currentFrame(on: key)
        }
    }

    private static func generateFrame(
        asset: AVAsset,
        at time: CMTime,
        maximumSize: CGSize
    ) async -> CGImage? {
        await withCheckedContinuation { continuation in
            let generator = AVAssetImageGenerator(asset: asset)
            let generatorBox = ImageGeneratorBox(generator)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = maximumSize
            generator.requestedTimeToleranceBefore = CMTime(seconds: 0.1, preferredTimescale: 600)
            generator.requestedTimeToleranceAfter = CMTime(seconds: 0.1, preferredTimescale: 600)
            generator.generateCGImagesAsynchronously(forTimes: [NSValue(time: time)]) {
                [generatorBox] _, image, _, result, _ in
                // 明确捕获 generator，保证异步生成期间不会被提前释放。
                _ = generatorBox.generator
                continuation.resume(returning: result == .succeeded ? image : nil)
            }
        }
    }

    /// 把抓帧限制在当前显示器能展示的像素范围内。
    ///
    /// 不直接写死 4K：Retina 5K 屏仍应保留足够清晰度，而 8K 素材不应把完整 8K
    /// `CGImage` 常驻内存。锁屏预览只需要覆盖当前显示器的最大像素边长。
    private static func maximumStillFrameSize() -> CGSize {
        let maximumPixels = NSScreen.screens.map { screen in
            max(
                Int((screen.frame.width * screen.backingScaleFactor).rounded()),
                Int((screen.frame.height * screen.backingScaleFactor).rounded())
            )
        }.max() ?? 3840
        let edge = CGFloat(max(1, maximumPixels))
        return CGSize(width: edge, height: edge)
    }

    func teardown() {
        for slot in slots.values { slot.teardown() }
        slots.removeAll()
        keyOrder.removeAll()
    }
}

/// 只用于延长 `AVAssetImageGenerator` 的生命周期。生成器自身的异步回调线程安全由
/// AVFoundation 负责；这里不会跨线程调用生成器方法，只是持有引用。
private final class ImageGeneratorBox: @unchecked Sendable {
    let generator: AVAssetImageGenerator

    init(_ generator: AVAssetImageGenerator) {
        self.generator = generator
    }
}
