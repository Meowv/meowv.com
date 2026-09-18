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
}

/// 播放引擎：持有若干**播放槽位**，每个槽位一个 `AVQueuePlayer`。
///
/// 多槽位是为「每屏独立」服务的：镜像与仅主屏只用一个 `.shared` 槽位，
/// 所有窗口挂同一个 player —— 多屏同时解码同一段视频，共享一个播放器最省资源。
/// 每屏独立时按屏幕各开一个槽位，代价是解码路数与流量按屏数翻倍
/// （上限见 `MultiScreenPolicy.maxIndependentScreens`）。
final class PlaybackEngine {

    /// 一个播放槽位：一个独立的播放器 + 循环器 + 当前条目。
    private final class Slot {
        let player = AVQueuePlayer()
        var looper: AVPlayerLooper?
        var statusObservation: NSKeyValueObservation?
        var item: WallpaperItem?
        var duration: Double?

        init() {
            player.isMuted = true
            // 壁纸不该阻止显示器休眠
            player.preventsDisplaySleepDuringVideoPlayback = false
            player.actionAtItemEnd = .advance
        }

        func teardown() {
            statusObservation = nil
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

        // 先拆旧的 looper 并清空队列，否则旧内容可能继续播放
        slot.statusObservation = nil
        slot.looper?.disableLooping()
        slot.looper = nil
        slot.player.removeAllItems()

        // 复用 VideoLoader 已经建好的 asset，不要再 AVPlayerItem(url:) 新建一个 ——
        // 那样会把同一个文件拉第二遍（实测 6.28MB 的视频变成 12.55MB 流量）。
        let playerItem = AVPlayerItem(asset: loaded.asset)
        // 让播放器尽量整段缓冲：10 秒的片段可以整段驻留，循环才稳。
        // 每屏独立时这份缓冲按槽位数翻倍，是内存占用的主要来源。
        playerItem.preferredForwardBufferDuration = min(loaded.durationSeconds, 30)

        slot.statusObservation = playerItem.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard item.status == .failed, let error = item.error else { return }
            DispatchQueue.main.async { self?.onFailure?(key, error) }
        }

        slot.looper = AVPlayerLooper(player: slot.player, templateItem: playerItem)
        slot.player.play()
    }

    func pause() {
        for slot in slots.values { slot.player.pause() }
    }

    func resume() {
        for slot in slots.values { slot.player.play() }
    }

    var isPlaying: Bool { slots.values.contains { $0.player.rate > 0 } }

    func teardown() {
        for slot in slots.values { slot.teardown() }
        slots.removeAll()
        keyOrder.removeAll()
    }
}
