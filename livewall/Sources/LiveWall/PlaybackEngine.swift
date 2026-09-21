import AVFoundation
import CoreImage
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

/// 播放引擎：持有若干**播放槽位**，每个槽位一个 `AVQueuePlayer`。
///
/// 多槽位是为「每屏独立」服务的：镜像与仅主屏只用一个 `.shared` 槽位，
/// 所有窗口挂同一个 player —— 多屏同时解码同一段视频，共享一个播放器最省资源。
/// 每屏独立时按屏幕各开一个槽位，代价是解码路数与流量按屏数翻倍
/// （上限见 `MultiScreenPolicy.maxIndependentScreens`）。
///
/// **`@MainActor`**：`currentFrame` 会跑 `RunLoop.main` 自旋取帧，
/// KVO 与失败通知也都在主队列上处理。标注把这件既成事实交给编译器执行。
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
        var duration: Double?
        var playbackGeneration = 0
        var didReportFailure = false

        init() {
            player.isMuted = true
            // 壁纸不该阻止显示器休眠
            player.preventsDisplaySleepDuringVideoPlayback = false
            player.actionAtItemEnd = .advance
        }

        func teardown() {
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
    func play(_ item: WallpaperItem, loaded: LoadedVideo, on key: PlaybackSlotKey) {
        guard let slot = slots[key] else { return }
        slot.item = item
        slot.duration = loaded.durationSeconds
        slot.playbackGeneration += 1
        let playbackGeneration = slot.playbackGeneration
        slot.didReportFailure = false

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
        // 让播放器尽量整段缓冲：10 秒的片段可以整段驻留，循环才稳。
        // 每屏独立时这份缓冲按槽位数翻倍，是内存占用的主要来源。
        playerItem.preferredForwardBufferDuration = min(loaded.durationSeconds, 30)

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

    /// 复用同一个 `CIContext`：新建的代价不小，而抓帧是低频动作。
    private static let ciContext = CIContext()

    /// 取指定槽位**当前显示帧**。取不到返回 nil —— 调用方保留旧图，绝不清空墙纸。
    ///
    /// 三条都经真机探针验证（见 `livewall/README.md` 的「关键发现」）：
    /// - output 必须挂在 **`player.currentItem`** 上。挂在 `AVPlayerLooper` 的 template item
    ///   上**取不到帧**（实测 24 秒 0 帧；改挂 currentItem 后 0.20 秒拿到首帧）——
    ///   looper 复制 template item 时不会把 output 一起带上。
    /// - 抓帧**不产生额外流量**（实测抓帧期间新增传输 0 字节）：解码数据已在缓冲里。
    /// - 取到即把 output 摘掉：常挂会有每帧回调的开销，而抓帧是低频一次性动作。
    func currentFrame(on key: PlaybackSlotKey) -> CGImage? {
        guard let slot = slots[key], let item = slot.player.currentItem else { return nil }

        let output = AVPlayerItemVideoOutput(pixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        ])
        item.add(output)
        defer { item.remove(output) }

        // 30fps 下相邻两帧相隔 33ms，0.4 秒的窗口足够（实测首帧 0.20 秒内拿到）。
        let deadline = Date().addingTimeInterval(0.4)
        while Date() < deadline {
            let itemTime = output.itemTime(forHostTime: CACurrentMediaTime())
            if itemTime.isValid,
               output.hasNewPixelBuffer(forItemTime: itemTime),
               let buffer = output.copyPixelBuffer(forItemTime: itemTime, itemTimeForDisplay: nil) {
                let image = CIImage(cvPixelBuffer: buffer)
                return Self.ciContext.createCGImage(image, from: image.extent)
            }
            // 让 AVFoundation 有机会投递新帧
            RunLoop.current.run(until: Date().addingTimeInterval(0.02))
        }
        return nil
    }

    func teardown() {
        for slot in slots.values { slot.teardown() }
        slots.removeAll()
        keyOrder.removeAll()
    }
}
