import AppKit

/// 菜单栏状态项图标的旋转动画。
///
/// ## 为什么是「运行时旋转」而不是预生成帧
///
/// 仓库没有图标生成流水线（`Resources/MenuBarIcon*.png` 是手工产物），把 24 帧 ×
/// 三档（1x/2x/3x）＝ 72 个 PNG 提交进 git 太重。改成：首次需要旋转时把基础图按
/// N 个角度**一次性**算成 N 张 `NSImage`（每张含基础图的全部缩放档位）缓存起来，
/// 之后定时器每 tick 只做「改下标 + 赋缓存好的图」—— **稳态每 tick 不重绘**。
///
/// ## 帧生成必须走 `NSBitmapImageRep`，不能用 `lockFocus`
///
/// `lockFocus` 只产出 1x 单 rep，Retina 上直接糊。这里照
/// `tools/make-dmg-background.swift` 的配方：按基础 rep 的**像素尺寸**建新 bitmap、
/// 再把逻辑尺寸钉在 18×18 —— `NSGraphicsContext(bitmapImageRep:)` 会按 `rep.size`
/// 自动缩放，所以画的时候直接用逻辑 pt 坐标即可。
///
/// ## `@MainActor`
///
/// 持有 `NSImage` 与 `Timer`（都不是 `Sendable`），且只被 `@MainActor` 的
/// `AppDelegate` 调用。`Timer` 的 block 是 `@Sendable`，**必须显式回跳主 actor** ——
/// `RunLoop.main` 只保证投递到主线程，不改变闭包本身的隔离。
///
/// ⚠️ 刻意**不写 `deinit` 碰 `Timer`**：Swift 6 的 `deinit` 是非隔离的，访问非
/// `Sendable` 的隔离属性会被判错。清理统一走 `stop()`，由 `AppDelegate.shutdown()` 调用。
@MainActor
final class MenuBarIconAnimator {

    /// 一圈的帧数。24 帧在 18pt 图标上已看不出跳帧。
    private let frameCount: Int
    /// 帧间隔。24 × 0.05s ≈ 1.2 秒一圈。
    private let frameInterval: TimeInterval
    /// 逻辑尺寸，与 `AppDelegate.menuBarIcon(named:)` 钉的 18×18 一致。
    private let logicalSize = NSSize(width: 18, height: 18)

    private var timer: Timer?
    /// 区分重启前后的定时器；已排队的旧帧任务不能影响新一轮动画。
    private var timerGeneration = 0
    private var frames: [NSImage] = []
    /// 生成 `frames` 用的基础图。**身份比较** —— 播放↔暂停切换时基图换了才重建。
    private var cachedBase: NSImage?
    private var index = 0

    /// 动画当前是否占据着图标（**冻结中也算占据**）。
    ///
    /// 与「定时器在跑」分开：菜单展开时表停了，但图标仍应停在动画的最后一帧上，
    /// 而不是被静态图顶掉。
    private(set) var ownsIcon = false

    /// 每一帧要显示的图。由 App 层接到 `statusItem.button` 上。
    ///
    /// **不要标 `@Sendable`** —— 它捕获 `NSStatusItem`，标了会编译不过。
    var onFrame: ((NSImage) -> Void)?

    /// 定时器**自行停止**时的回调（每帧重新判定时发现不该转了）。
    ///
    /// App 层在这里回写静态图 —— 停止条件只有这一条路，见 `tick()`。
    var onStop: (() -> Void)?

    /// 每帧询问：现在该不该继续转。由 App 层注入。
    var shouldContinue: (() -> Bool)?

    init(frameCount: Int = 24, frameInterval: TimeInterval = 0.05) {
        self.frameCount = frameCount
        self.frameInterval = frameInterval
    }

    /// 让动画接管图标，或把图标交还回去。
    ///
    /// 幂等：已在跑且基图没换时不会重建帧，也不会重启定时器 ——
    /// `refreshStatusItem()` 有六十来个调用点，这条保证是必需的。
    ///
    /// - Returns: `true` 表示图标已由动画占据，调用方**不要**再写静态图。
    @discardableResult
    func update(isActive: Bool, base: NSImage?) -> Bool {
        guard isActive, let base else {
            stop()
            return false
        }

        if cachedBase !== base || frames.isEmpty {
            cachedBase = base
            frames = Self.rotatedFrames(of: base, count: frameCount, size: logicalSize)
            index = 0
        }
        guard !frames.isEmpty else {
            // 基础图取不到位图 rep（例如来源不是 PNG）→ 交还给静态图，别空转。
            stop()
            return false
        }

        let wasRunning = timer != nil
        startTimerIfNeeded()
        ownsIcon = true
        // 已经在跑就别重复赋同一帧：赋图会触发状态项重绘。
        if !wasRunning { emit() }
        return true
    }

    /// 冻结：停表并保留当前角度，基图变化时仍更新颜色（菜单展开期间用）。
    ///
    /// 比「切回静态图」好：展开菜单时图标不会从当前角度跳回 0°。
    ///
    /// - Returns: `true` 表示图标仍由动画占据，调用方什么都不用做。
    @discardableResult
    func freeze(base: NSImage?) -> Bool {
        guard ownsIcon else { return false }
        timer?.invalidate()
        timer = nil

        guard let base else {
            stop()
            return false
        }
        if cachedBase !== base {
            cachedBase = base
            frames = Self.rotatedFrames(of: base, count: frameCount, size: logicalSize)
            guard !frames.isEmpty else {
                stop()
                return false
            }
            // 两种基图使用相同帧数，保留下标即可在原角度切换播放 / 暂停颜色。
            emit()
        }
        return true
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        ownsIcon = false
    }

    // MARK: - 内部

    private func startTimerIfNeeded() {
        guard timer == nil else { return }
        timerGeneration += 1
        let generation = timerGeneration
        let timer = Timer(timeInterval: frameInterval, repeats: true) { [weak self] _ in
            // `Timer` 的 block 是 `@Sendable`（非隔离），而 `tick()` 是主 actor 隔离的 ——
            // 必须显式回跳，不能直接调。定时器本来就挂在 `RunLoop.main` 上，
            // 这次回跳只是把「编译器需要的那次声明」补上。
            Task { @MainActor [weak self] in self?.tick(generation: generation) }
        }
        // .common 模式：菜单打开时也要继续走（不过展开期已被 `freeze()` 停表）。
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    private func tick(generation: Int) {
        // invalidate 不会撤销已经排队的 Task。冻结或停用后不能再触发 onStop，
        // 重启后旧任务也不能推进新定时器的帧。
        guard timer != nil, generation == timerGeneration else { return }
        // 停止条件在这里**统一兜住**：不在每个动作的结束处补钩子 ——
        // 少一处钩子就少一个「图标永远转下去」的机会。代价是停止最多滞后一帧（50ms）。
        guard shouldContinue?() ?? false, !frames.isEmpty else {
            stop()
            onStop?()
            return
        }
        index = (index + 1) % frames.count
        emit()
    }

    private func emit() {
        guard frames.indices.contains(index) else { return }
        onFrame?(frames[index])
    }

    // MARK: - 帧生成

    /// 把基础图按等分角度旋转成 `count` 张图，每张保留基础图的全部缩放档位。
    ///
    /// 任一步失败就整体返回空数组，绝不混进「半张图」—— 半成品比没有更糟：
    /// 图标会在某一帧突然变小或变糊，而调用方还以为动画是好的。
    private static func rotatedFrames(of base: NSImage, count: Int, size: NSSize) -> [NSImage] {
        guard count > 1 else { return [base] }
        let sources = base.representations.compactMap { $0 as? NSBitmapImageRep }
        guard !sources.isEmpty else { return [] }

        var result: [NSImage] = []
        result.reserveCapacity(count)
        for step in 0..<count {
            // AppKit 的 y 轴朝上，正角度是逆时针；取负号才是顺时针转。
            let angle = -2 * CGFloat.pi * CGFloat(step) / CGFloat(count)
            let image = NSImage(size: size)
            var addedAny = false
            for source in sources {
                guard let rotated = rotatedRepresentation(source, angle: angle, size: size) else { continue }
                image.addRepresentation(rotated)
                addedAny = true
            }
            guard addedAny else { return [] }
            result.append(image)
        }
        return result
    }

    /// 旋转单个位图 rep。输出 bitmap 的**像素尺寸与输入相同**，逻辑尺寸钉在 `size`。
    private static func rotatedRepresentation(
        _ source: NSBitmapImageRep, angle: CGFloat, size: NSSize
    ) -> NSBitmapImageRep? {
        guard source.pixelsWide > 0, source.pixelsHigh > 0 else { return nil }
        guard
            let output = NSBitmapImageRep(
                bitmapDataPlanes: nil,
                pixelsWide: source.pixelsWide,
                pixelsHigh: source.pixelsHigh,
                bitsPerSample: 8,
                samplesPerPixel: 4,
                hasAlpha: true,
                isPlanar: false,
                colorSpaceName: .deviceRGB,
                bytesPerRow: 0,
                bitsPerPixel: 0
            )
        else { return nil }
        // 逻辑尺寸决定「这张 rep 代表多少 pt」—— Retina 采样靠的就是它，
        // 与 `make-dmg-background.swift` 里 `rep.size = 画布 pt` 是同一件事。
        output.size = size

        guard let context = NSGraphicsContext(bitmapImageRep: output) else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        context.cgContext.setShouldAntialias(true)
        // 绕中心旋转：平移到中心 → 转 → 平移回去。
        let cg = context.cgContext
        cg.translateBy(x: size.width / 2, y: size.height / 2)
        cg.rotate(by: angle)
        cg.translateBy(x: -size.width / 2, y: -size.height / 2)
        _ = source.draw(in: NSRect(origin: .zero, size: size))
        context.flushGraphics()
        NSGraphicsContext.restoreGraphicsState()
        return output
    }
}
