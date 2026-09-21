import AppKit
import LiveWallCore

/// 浏览窗口加载失败的展示用错误。
///
/// 刻意只带一句话：浏览窗口能做的处置只有「显示原因 + 给个重试按钮」，
/// 不需要区分错误种类。原因文案由数据源拼好（它才知道是远程失败还是副本失败）。
struct BrowserLoadFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// 浏览窗口需要从 App 拿到的全部东西。
///
/// 抽成协议是为了让 VC 不直接依赖 `AppDelegate`（也就不会把 `AppDelegate` 的
/// 四十来个私有成员暴露给它）。**刻意只抽这一个** —— 不为「可测试」把 AppKit 代码
/// 做成层层抽象：这个 VC 的正确性本来就只能人工验（`AGENTS.md` 的既有结论）。
///
/// **`@MainActor` 是语义的一部分，不是为消错加的**：实现方是 `AppDelegate`（主 actor），
/// 使用方是 `NSViewController` 子类（AppKit 已隐式主 actor），`completion` 也约定在主线程回调。
/// 不标的话 Swift 6 会判「一致性跨进主 actor 隔离」（实测 1 error），
/// 而唯一能绕过它的写法（把协议标成 `nonisolated`）等于**抹掉**这个真实约定。
@MainActor
protocol WallpaperBrowserDataSource: AnyObject {
    /// 索引里的分类清单（含条目数为 0 的）。左栏数据源。
    var browserCategories: [LivewallCategoryEntry] { get }
    /// 当前正在播的分类。窗口打开时默认选中它。
    var browserSelectedCategoryID: Int? { get }
    /// 当前固定项的 id。UI **只标记**它，不提供取消固定的入口（决策 11）。
    var browserPinnedItemID: Int? { get }

    /// 拉取某个分类的条目。
    ///
    /// **绝不写共享切片缓存** —— `sliceCacheURL` 只有一份，是播放的离线兜底；
    /// 浏览窗口是只读调用方。失败时 `message` 直接给用户看。
    ///
    /// ## 回调上的两个标注都是契约，不是消错
    ///
    /// 取数在后台队列上跑，`completion` 在**主 actor** 上回调（VC 要直接改 UI）。
    /// 两个标注缺一不可：
    ///  - `@MainActor` 说明「回调时你在主线程」，调用方因此可以直写 UI；
    ///  - `@Sendable` 说明「这个闭包会被送到别的隔离域再送回来」，所以实现方
    ///    才能在后台队列闭包里持有它。少了它，Swift 6 会判
    ///    「捕获非 Sendable 的 completion」（实测 1 条 warning）。
    /// 调用方无需额外标注：闭包字面量会按这个类型自动推断出两个属性。
    func browserLoadItems(
        for categoryID: Int,
        completion: @escaping @MainActor @Sendable (Result<[WallpaperItem], BrowserLoadFailure>) ->
            Void
    )

    /// 设为桌面壁纸。落实路径在 `AppDelegate.setPinned`。
    func browserSetPinned(_ item: WallpaperItem, categoryID: Int)
}

/// 浮层容器本身不抢事件，真正的背景层负责关闭浮层。
private final class PassThroughView: NSView {

    override func hitTest(_ point: NSPoint) -> NSView? {
        let hit = super.hitTest(point)
        return hit === self ? nil : hit
    }
}

/// 预览浮层的压暗背景：点击背景关闭，而不是把事件穿透到网格。
private final class PreviewBackdropView: NSView {
    var onClick: (() -> Void)?

    override func mouseDown(with event: NSEvent) {
        onClick?()
    }
}

/// 只为「双击」存在的网格子类。
///
/// `NSCollectionView` **没有** `doubleAction` / `target`（`NSTableView` 才有），
/// delegate 里也没有双击回调，所以只能自己看 `mouseDown` 的 `clickCount`。
/// 别换成手势识别器：那要额外处理「与选中手势谁先拿事件」，
/// 而这里只需要一次 `clickCount` 判断。
private final class BrowserGridView: NSCollectionView {

    /// 命中的条目下标。**只在真的双击到某张卡片时**回调。
    var onDoubleClick: ((IndexPath) -> Void)?

    /// 网格的**真实可用宽度**（clip view 的宽度）在每次布局后回调。
    ///
    /// 不能只靠 `NSViewController.viewDidLayout` 或 clip view 的 bounds 通知：
    /// 实测这两者在探针/冷启动路径里都**一次都没触发**，于是首轮按错误宽度
    /// （984，滚动条尚未布局）算出的卡片尺寸再也没被纠正过。
    /// `layout()` 是每次布局都走的，最可靠。
    var onWidthChange: ((CGFloat) -> Void)?

    override func layout() {
        super.layout()
        if let clip = enclosingScrollView?.contentView {
            onWidthChange?(clip.bounds.width)
        }
    }

    // 宽度是 `autoresizingMask = [.width]` 跟着 clip view 变的，所以 `setFrameSize`
    // 必然被调用 —— 比 `layout()` 更可靠：clip 缩窄之后 collection view 未必会再排一次。
    override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        // 用 clip view 的宽度而不是 newSize：首轮手动设的 frame（984）还没扣滚动条。
        if let clip = enclosingScrollView?.contentView {
            onWidthChange?(clip.bounds.width)
        }
    }

    override func mouseDown(with event: NSEvent) {
        // 先交给父类 —— 双击的第一下本来就该先选中那张卡片，
        // 于是双击之后「选中项」与「浮层里的条目」是一致的。
        super.mouseDown(with: event)
        guard event.clickCount == 2 else { return }
        let point = convert(event.locationInWindow, from: nil)
        guard let indexPath = indexPathForItem(at: point) else { return }
        onDoubleClick?(indexPath)
    }
}

/// 动态壁纸浏览窗口的内容。
///
/// **两栏布局**：左 = 分类，右 = 条目网格。预览不再是常驻的一栏 ——
/// 双击某张卡片时才在网格区上方弹一个预览浮层（见 `openPreview(forItemAt:)`）。
/// 尺寸与取舍见 `AGENTS.md` 与 `livewall/README.md`。
final class WallpaperBrowserViewController: NSViewController {

    // 布局常量
    /// 分类栏保留 Source List 的呼吸感，也能容纳分类数量和较长名称。
    private static let categoryWidth: CGFloat = 128
    private static let categoryFontSize: CGFloat = 13
    private static let categoryRowHeight: CGFloat = 32

    private static let gridInset: CGFloat = 16
    private static let cardSpacing: CGFloat = 16
    /// 列数随网格宽度切换（3 / 4 / 5）。阈值按「均分后的卡片宽度落在 180–260pt」
    /// 定的：太窄看不清缩略图，太宽一屏没几条。
    private static let columns4From: CGFloat = 880
    private static let columns5From: CGFloat = 1120

    /// 预览浮层相对网格区的内缩。
    private static let overlayInset: CGFloat = 32
    /// 浮层宽度区间：窄窗口跟着网格区收，宽窗口封顶。
    /// 上限从 560 放大到 760 —— 预览是「看清这条到底长什么样」的地方，
    /// 760×427 的画面才够判断。
    private static let overlayMaxWidth: CGFloat = 760
    private static let overlayMinWidth: CGFloat = 420
    /// 浮层面板内的横向内边距。
    private static let panelPadding: CGFloat = 12

    private weak var dataSource: WallpaperBrowserDataSource?

    // 左栏：分类
    private let categoryTable = NSTableView()
    private let categoryScroll = NSScrollView()

    // 右栏：条目网格
    private let collectionView = BrowserGridView()
    private let gridScroll = NSScrollView()
    private let gridPlaceholder = NSView()
    private let gridPlaceholderLabel = NSTextField(labelWithString: "")
    private let gridSpinner = NSProgressIndicator()
    private let gridRetryButton = NSButton()

    // 预览浮层：双击或 Hover 按钮打开，盖在网格区上
    private let previewOverlay = PassThroughView()
    /// 压暗层：点击背景关闭预览，避免「看起来像模态、实际上能点穿」的混合行为。
    private let previewBackdrop = PreviewBackdropView()
    private let previewPanel = NSView()
    private let previewStage = NSView()
    private let previewImageView = NSImageView()
    private let previewPlaceholderLabel = NSTextField(labelWithString: "无预览图")
    private let previewStateContainer = NSView()
    private let previewStateLabel = NSTextField(labelWithString: "")
    private let previewRetryButton = NSButton()
    private let previewCloseButton = NSButton()
    private let previewInfoLabel = NSTextField(labelWithString: "")
    /// 「设为桌面壁纸」。放在画面**下方信息行的右端**（原来「停止预览」的位置）——
    /// 叠在画面上会挡住要预览的东西。
    private let pinButton = NSButton()
    /// 浮层面板的**宽度**。写成常量约束 + 在 `viewDidLayout` 里改 constant，
    /// 而不是 `panel.width == overlay.width - 80`：见 `viewDidLayout` 里的说明。
    private var panelWidthConstraint: NSLayoutConstraint!

    // 状态
    private var categories: [LivewallCategoryEntry] = []
    private var items: [WallpaperItem] = []
    private var selectedCategoryID: Int?
    /// 预览浮层当前展示的条目 id（`nil` = 浮层未打开）。
    ///
    /// **不与网格选中项挂钩**：浮层只跟着「双击」走。单击别的卡片只移动网格高亮，
    /// 不该顺手把浮层里正在播的那条换掉 —— 否则「挑一张看看」和「翻着找」会互相打断。
    private var previewItemID: Int?
    /// 上次算过的网格宽度，用来判断「要不要让流式布局重算卡片尺寸」。
    private var lastGridWidth: CGFloat = 0
    /// 分类切片请求序号。**独立于 `AppDelegate.sliceRequestGeneration`** ——
    /// 那个是播放用的，两者混用会让「浏览别的分类」把正在播的加载结果判成过期。
    private var sliceGeneration = 0

    private let loader = ThumbnailLoader()
    private let previewPlayer = PreviewPlayer()
    private var thumbnailDebounce: Timer?

    /// 日志出口，由 `AppDelegate` 注入（与 App 其余部分共用同一个日志文件）。
    var log: ((String) -> Void)? {
        didSet {
            loader.log = log
            previewPlayer.log = log
        }
    }

    init(dataSource: WallpaperBrowserDataSource) {
        self.dataSource = dataSource
        super.init(nibName: nil, bundle: nil)
    }

    /// ⚠️ 显式传 `file: ""` / `line: 0`：`fatalError` 的 `file:` 默认值是 `#file`，
    /// 会把**源文件名作为字符串常量**嵌进二进制（`strip` 管不到字符串字面量，
    /// 实测 release 二进制里因此残留 3 个源文件名）。这条路径永不执行，
    /// 丢掉崩溃定位信息零代价。
    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("不支持从 nib 加载", file: "", line: 0) }

    // MARK: - 生命周期

    override func loadView() {
        let root = NSView(frame: NSRect(x: 0, y: 0, width: 1060, height: 660))
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        view = root

        buildCategoryColumn(in: root)
        buildGridColumn(in: root)
        buildPreviewOverlay(in: root)
        // 没有底栏了：底栏原本显示「分类 · 共 N 条」，而条目数在翻页/筛选之外
        // 没有额外信息量（网格本身就是全部条目），占着 26pt 不划算。

        NSLayoutConstraint.activate([
            // 两栏：左 = 分类（定宽），右 = 网格（吃掉剩下的全部宽度）
            categoryScroll.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            categoryScroll.topAnchor.constraint(equalTo: root.topAnchor),
            categoryScroll.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            categoryScroll.widthAnchor.constraint(equalToConstant: Self.categoryWidth),

            gridScroll.leadingAnchor.constraint(equalTo: categoryScroll.trailingAnchor),
            gridScroll.topAnchor.constraint(equalTo: root.topAnchor),
            gridScroll.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            gridScroll.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            gridScroll.widthAnchor.constraint(greaterThanOrEqualToConstant: 460),
        ])
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        previewPlayer.onStateChange = { [weak self] state in
            self?.applyPreviewState(state)
        }

        collectionView.onDoubleClick = { [weak self] indexPath in
            self?.openPreview(forItemAt: indexPath)
        }
        collectionView.onWidthChange = { [weak self] width in
            self?.applyGridWidth(width)
        }

        // 滚动停止后才去要缩略图。用 bounds 变化 + debounce 而不是
        // `didEndLiveScrollNotification`：后者只在「实时滚动」结束时发，
        // 拖滚动条、键盘翻页都收不到，而那些场景同样需要补图。
        gridScroll.contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(gridBoundsDidChange),
            name: NSView.boundsDidChangeNotification,
            object: gridScroll.contentView
        )

        categories = dataSource?.browserCategories ?? []
        // 默认选中当前正在播的分类；记忆值不在索引里（或没配）时退回第一个**有内容**的
        // 分类 —— 选中一个 0 条的分类会立刻撞上「加载失败」。
        selectedCategoryID = dataSource?.browserSelectedCategoryID
            ?? categories.first(where: { $0.itemCount > 0 })?.id
        reloadCategoryTable()

        if let selectedCategoryID {
            loadItems(for: selectedCategoryID)
        } else {
            updateGridPlaceholder(message: "清单里没有分类信息", showSpinner: false)
        }
        // 初始状态是 `.idle`，不会触发 `onStateChange`（回调只在实际变化时发），
        // 所以这里显式同步一次，否则浮层里的按钮文案要等第一次操作才对。
        applyPreviewState(previewPlayer.state)
    }

    /// 按网格区的实际宽度夹取浮层面板宽度。
    ///
    /// **为什么是常量约束 + 改 constant，而不是 `panel.width == overlay.width - 80`**：
    /// 那种等式两边都能动，Auto Layout 为了满足它会反过来压窄网格区（连带整个窗口），
    /// 实测把窗口从 1060 压到了 778 —— 比 `minSize` 880 还小。常量约束只会决定面板自己。
    ///
    /// 只在真的变了时才写，否则每次 layout 都改 constant 会触发又一轮布局。
    override func viewDidLayout() {
        super.viewDidLayout()

        // 窗口拉宽/拉窄之后必须让流式布局重算卡片尺寸，否则列数与卡宽都停在旧值上
        // （表现是右边多出一条空白，或者卡片被裁）。
        gridScroll.layoutSubtreeIfNeeded()
        applyGridWidth(gridScroll.contentView.bounds.width)

        let available = gridScroll.frame.width - 2 * Self.overlayInset
        let width = min(max(available, Self.overlayMinWidth), Self.overlayMaxWidth)
        if abs(panelWidthConstraint.constant - width) > 0.5 {
            panelWidthConstraint.constant = width
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    /// 关窗口时调用：停预览、取消在飞请求、停 debounce。
    ///
    /// **不动桌面播放**（决策 12）—— 浏览窗口只是「挑一张」的工具。
    func teardown() {
        // 先关浮层（它会释放播放器并清掉静态图），再走一遍播放器释放 ——
        // 浮层没开时 `dismissPreview` 会直接返回，重复调用无害。
        dismissPreview(nil)
        previewPlayer.teardown()
        loader.cancelAll()
        thumbnailDebounce?.invalidate()
        thumbnailDebounce = nil
    }

    /// 固定项变了（菜单里固定 / 解钉之后）。只刷新徽标与浮层按钮，不动列表数据。
    func refreshPinState() {
        refreshVisibleBadges()
        updatePreviewPanel()
    }

    /// 关掉「最上面那一层」。浮层开着就收浮层并返回 true；否则返回 false（调用方再决定关窗口）。
    ///
    /// 抽出来是因为现在有**两个**入口（Esc 与 ⌘W）要走同一套层次规则 ——
    /// 各写一份的话，「浮层优先」这条迟早会在其中一个入口上漏掉。
    @discardableResult
    private func dismissTopLayer() -> Bool {
        guard !previewOverlay.isHidden else { return false }
        dismissPreview(nil)
        return true
    }

    /// Esc：**先关预览浮层**；浮层没开才关窗口。
    ///
    /// 按 Esc 的意图是「退出当前这一层」，直接把整个窗口关掉太狠了 ——
    /// 而浮层是叠在网格上的一层，理应第一个被 Esc 收掉。
    override func cancelOperation(_ sender: Any?) {
        guard !dismissTopLayer() else { return }
        view.window?.performClose(nil)
    }

    /// ⌘W：与 Esc 同一套层次规则（先收浮层，再关窗口）。
    ///
    /// 由 `BrowserWindow.performKeyEquivalent(with:)` 转过来 —— 带 Command 的按键事件
    /// 不走 `keyDown` / `cancelOperation`，而本 App 没有 main menu 去提供 ⌘W 菜单项，
    /// 所以只能在那里接（详见 `BrowserWindow` 的注释）。
    ///
    /// **只认恰好 ⌘ 的组合**：`⇧⌘W` 在 macOS 上是「关闭所有窗口」、`⌥⌘W` 是别的语义，
    /// 本 App 只有一个窗口，这些组合按下去什么都不做比误关更符合预期。
    /// 用 `charactersIgnoringModifiers` 而不是键码：菜单快捷键本来就是按**字符**匹配的，
    /// 换成非 QWERTY 布局（AZERTY 的 W 在别的位置）也仍然成立。
    func handleWindowKeyEquivalent(_ event: NSEvent) -> Bool {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        guard flags == .command,
              event.charactersIgnoringModifiers?.lowercased() == "w" else { return false }
        guard !dismissTopLayer() else { return true }
        view.window?.performClose(nil)
        return true
    }

    // MARK: - 左栏：分类

    private func buildCategoryColumn(in root: NSView) {
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("Category"))
        column.resizingMask = .autoresizingMask
        // ⚠️ 列宽必须**显式**设成栏宽：`NSTableColumn` 默认是 100pt，栏宽变化后
        // 列不会自动跟着收 —— 实测单元格仍是 100 宽，长分类名被滚动视图硬裁，
        // 而不是在标签内部截断成「超长分类名…」。
        column.width = Self.categoryWidth
        column.minWidth = Self.categoryWidth
        column.maxWidth = Self.categoryWidth
        categoryTable.addTableColumn(column)
        categoryTable.headerView = nil
        categoryTable.setAccessibilityLabel("壁纸分类")
        categoryTable.rowHeight = Self.categoryRowHeight
        categoryTable.allowsEmptySelection = false
        categoryTable.allowsMultipleSelection = false
        categoryTable.style = .sourceList
        categoryTable.dataSource = self
        categoryTable.delegate = self

        // 同 collection view：documentView 的尺寸由它自己管，只让宽度跟住滚动视图。
        // 先定 frame 再挂 documentView —— 反过来有些 AppKit 版本会用 clip view 的
        // 初始 bounds（0×0）把 documentView 的尺寸重置掉。
        categoryTable.frame = NSRect(x: 0, y: 0, width: Self.categoryWidth, height: 660)
        categoryTable.autoresizingMask = [.width]
        categoryScroll.documentView = categoryTable
        categoryScroll.hasVerticalScroller = true
        categoryScroll.scrollerStyle = .overlay
        categoryScroll.autohidesScrollers = true
        categoryScroll.drawsBackground = false
        categoryScroll.borderType = .noBorder
        categoryScroll.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(categoryScroll)
    }

    private func reloadCategoryTable() {
        categoryTable.reloadData()
        if let selectedCategoryID, let row = categories.firstIndex(where: { $0.id == selectedCategoryID }) {
            categoryTable.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
        }
    }

    // MARK: - 右栏：条目网格

    private func buildGridColumn(in root: NSView) {
        let layout = NSCollectionViewFlowLayout()
        layout.minimumInteritemSpacing = Self.cardSpacing
        layout.minimumLineSpacing = Self.cardSpacing
        layout.sectionInset = NSEdgeInsets(
            top: Self.gridInset,
            left: Self.gridInset,
            bottom: Self.gridInset,
            right: Self.gridInset
        )

        collectionView.collectionViewLayout = layout
        collectionView.dataSource = self
        collectionView.delegate = self
        collectionView.isSelectable = true
        collectionView.allowsEmptySelection = true
        collectionView.allowsMultipleSelection = false
        collectionView.setAccessibilityLabel("动态壁纸")
        collectionView.backgroundColors = [.clear]
        collectionView.register(BrowserItemView.self, forItemWithIdentifier: BrowserItemView.identifier)

        // 刻意**不给 collection view 加 Auto Layout 约束**：它作为 documentView 时会
        // 按流式布局算出的内容高度改写自己的 frame，而 Auto Layout 会跟它抢这个值
        // （表现是「只能看到第一行」或「滚不动」）。给一个默认窗口尺寸下的非零初始
        // frame + 宽度自适应，剩下的交给它自己 —— 与 `NSTableView` 当 documentView
        // 是同一套机制。先定 frame 再挂 documentView。
        // 初始 frame 只用来给布局一个非零起点（宽度随后由 autoresizingMask 跟上）；
        // 932 = 默认窗口 1060 − 分类栏 128。
        collectionView.frame = NSRect(x: 0, y: 0, width: 932, height: 660)
        collectionView.autoresizingMask = [.width]
        // 卡片尺寸要在 frame 定下来之后才算（它取决于网格宽度）。
        layout.itemSize = gridItemSize()
        gridScroll.documentView = collectionView
        gridScroll.hasVerticalScroller = true
        gridScroll.scrollerStyle = .overlay
        gridScroll.autohidesScrollers = true
        gridScroll.drawsBackground = false
        gridScroll.borderType = .noBorder
        gridScroll.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(gridScroll)

        // 加载中 / 空 / 失败的居中提示，盖在网格上
        gridPlaceholder.translatesAutoresizingMaskIntoConstraints = false
        gridPlaceholder.isHidden = true
        root.addSubview(gridPlaceholder)

        gridSpinner.style = .spinning
        gridSpinner.controlSize = .small
        gridSpinner.isDisplayedWhenStopped = false

        gridPlaceholderLabel.font = .systemFont(ofSize: 12)
        gridPlaceholderLabel.textColor = .secondaryLabelColor
        gridPlaceholderLabel.alignment = .center
        gridPlaceholderLabel.maximumNumberOfLines = 3
        gridPlaceholderLabel.lineBreakMode = .byWordWrapping

        gridRetryButton.title = "重试"
        gridRetryButton.bezelStyle = .rounded
        gridRetryButton.target = self
        gridRetryButton.action = #selector(retryLoadItems)
        gridRetryButton.isHidden = true

        // 三者一起进 stack（`NSStackView(views:)` 会把它们从原父视图移过来），
        // 所以这里不再单独 addSubview。
        let stack = NSStackView(views: [gridSpinner, gridPlaceholderLabel, gridRetryButton])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        gridPlaceholder.addSubview(stack)

        NSLayoutConstraint.activate([
            gridPlaceholder.leadingAnchor.constraint(equalTo: gridScroll.leadingAnchor),
            gridPlaceholder.trailingAnchor.constraint(equalTo: gridScroll.trailingAnchor),
            gridPlaceholder.topAnchor.constraint(equalTo: gridScroll.topAnchor),
            gridPlaceholder.bottomAnchor.constraint(equalTo: gridScroll.bottomAnchor),
            stack.centerXAnchor.constraint(equalTo: gridPlaceholder.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: gridPlaceholder.centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualTo: gridPlaceholder.widthAnchor, constant: -40),
        ])
    }

    /// 按网格宽度决定列数：**3 / 4 / 5**。
    private static func gridColumns(forWidth width: CGFloat) -> Int {
        if width < Self.columns4From { return 3 }
        if width < Self.columns5From { return 4 }
        return 5
    }

    /// 当前列宽下的卡片尺寸 —— **卡片撑满所在列**，不再留右侧空白。
    ///
    /// 用 `sizeForItemAt` 每次问而不是写死：窗口一拉宽，列数与卡宽都得跟着变。
    private func gridItemSize() -> NSSize {
        // ⚠️ 必须用 **clip view** 的宽度，不能用 `collectionView.bounds.width`：
        // 后者在早期的布局轮次里还是「整个滚动视图」的宽度（984），而真实可用宽度
        // 要扣掉竖向滚动条（实测 967，差 17）。按 984 算出来的 4 列卡片在 967 里
        // 只放得下 3 列，右边会空出 226pt —— 正是要消除的那种空白。
        let total = max(gridScroll.contentView.bounds.width, 1)
        let columns = Self.gridColumns(forWidth: total)
        let usable = total - Self.gridInset * 2 - Self.cardSpacing * CGFloat(columns - 1)
        // ⚠️ 留 1pt 余量：**正好放得下**时流式布局会少放一列（浮点边界）。
        // 实测 1060 窗口下 4×226.75 + 间距 = 943，可用正好 943 → 只摆了 3 列，
        // 右边空出 226pt。留 1pt 之后 4 列就能放下，右侧只余 1pt。
        let width = max((usable - 1) / CGFloat(columns), 80)
        return BrowserItemView.cardSize(fittingWidth: width)
    }

    /// 网格宽度变了 → 重算卡片尺寸（列数与卡宽都依赖它）。
    ///
    /// 三个入口都调它：`BrowserGridView.layout()`（每次布局都走，最可靠）、
    /// `viewDidLayout`、`gridBoundsDidChange`。
    private func applyGridWidth(_ width: CGFloat) {
        guard width > 1, abs(width - lastGridWidth) > 0.5 else { return }
        lastGridWidth = width
        // 显式写回 `itemSize`，不单靠 `sizeForItemAt`：实测只 invalidate 的话
        // 尺寸查询跑了、卡片 frame 却还是旧的。
        if let flow = collectionView.collectionViewLayout as? NSCollectionViewFlowLayout {
            flow.itemSize = gridItemSize()
        }
        collectionView.collectionViewLayout?.invalidateLayout()
        // `invalidateLayout()` 不会把 collection view 标成 needsLayout，
        // 不标这一行下一次布局会直接跳过。
        collectionView.needsLayout = true
    }

    private func updateGridPlaceholder(message: String?, showSpinner: Bool, canRetry: Bool = false) {
        if showSpinner { gridSpinner.startAnimation(nil) } else { gridSpinner.stopAnimation(nil) }
        gridPlaceholderLabel.stringValue = message ?? ""
        gridPlaceholderLabel.isHidden = (message ?? "").isEmpty
        gridRetryButton.isHidden = !canRetry
        gridPlaceholder.isHidden = !showSpinner && (message ?? "").isEmpty && !canRetry
    }

    private func reloadGrid() {
        collectionView.reloadData()
        // 让 `NSCollectionView` 立刻建出可见的卡片 —— 否则
        // `indexPathsForVisibleItems()` 还是空的，第一屏的缩略图要等下一次滚动才加载。
        view.layoutSubtreeIfNeeded()
        loadVisibleThumbnails(replacingPending: true)
    }

    // MARK: - 预览浮层（双击打开，盖在网格区上）

    private func buildPreviewOverlay(in root: NSView) {
        previewOverlay.translatesAutoresizingMaskIntoConstraints = false
        // 只盖网格区：分类栏留着能点（切分类会顺手关掉浮层）。
        previewOverlay.isHidden = true
        root.addSubview(previewOverlay)

        // 压暗层：**不做成可点关闭**。事件穿透之后，「点背景关浮层」会和
        // 「点网格里的卡片」抢同一个手势；关浮层的出口留 ✕ 与 Esc 两个就够了。
        previewBackdrop.translatesAutoresizingMaskIntoConstraints = false
        previewBackdrop.wantsLayer = true
        previewBackdrop.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.35).cgColor
        previewBackdrop.onClick = { [weak self] in
            self?.dismissPreview(nil)
        }
        previewOverlay.addSubview(previewBackdrop)

        previewPanel.wantsLayer = true
        previewPanel.layer?.cornerRadius = 10
        previewPanel.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        previewPanel.layer?.shadowOpacity = 0.35
        previewPanel.layer?.shadowRadius = 18
        previewPanel.layer?.shadowOffset = CGSize(width: 0, height: -4)
        // **刻意不开 `masksToBounds`**：开了会连阴影一起裁掉（圆角 + 阴影的经典冲突）。
        // 圆角由画面区自己裁（见下），面板只负责背景与投影。
        previewPanel.translatesAutoresizingMaskIntoConstraints = false
        previewOverlay.addSubview(previewPanel)

        buildPreviewStage()
        buildPreviewFooter()
        activatePreviewOverlayConstraints()
    }

    /// 16:9 画面区：画面层、静态图、占位文案、预览播放器、状态层，以及画面内的关闭 / 重试按钮。
    ///
    /// 从 `buildPreviewOverlay` 里拆出来**纯粹是为了可读**（那个方法原本 185 行）：
    /// 三个构建方法各自只碰自己那几个子视图，约束集中在 `activatePreviewOverlayConstraints`。
    private func buildPreviewStage() {
        previewStage.wantsLayer = true
        previewStage.layer?.masksToBounds = true
        // 画面顶到面板上边缘 → 只裁上面两个角，与面板的圆角对齐；
        // 下面两个角是方的（紧挨着信息行），裁了反而会露出面板底色。
        previewStage.layer?.cornerRadius = 10
        previewStage.layer?.maskedCorners = [.layerMinXMaxYCorner, .layerMaxXMaxYCorner]
        // 画面区固定深底：视频画面本来就该是深底，浅底还会在加载完之前闪一下白。
        previewStage.layer?.backgroundColor = NSColor.black.cgColor
        previewStage.translatesAutoresizingMaskIntoConstraints = false
        previewPanel.addSubview(previewStage)

        previewImageView.imageScaling = .scaleProportionallyUpOrDown
        previewImageView.translatesAutoresizingMaskIntoConstraints = false
        previewStage.addSubview(previewImageView)

        previewPlaceholderLabel.font = .systemFont(ofSize: 12)
        previewPlaceholderLabel.textColor = .secondaryLabelColor
        previewPlaceholderLabel.alignment = .center
        previewPlaceholderLabel.translatesAutoresizingMaskIntoConstraints = false
        previewStage.addSubview(previewPlaceholderLabel)

        previewPlayer.view.translatesAutoresizingMaskIntoConstraints = false
        previewPlayer.view.isHidden = true
        previewStage.addSubview(previewPlayer.view)

        // 状态提示（加载中 / 资源不可用）。用容器而不是直接给
        // NSTextField 设 layer 背景 —— 文本字段自己会画背景，两者会打架。
        previewStateContainer.wantsLayer = true
        previewStateContainer.layer?.cornerRadius = 3
        previewStateContainer.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.6).cgColor
        previewStateContainer.translatesAutoresizingMaskIntoConstraints = false
        // 一开始没有状态可显示，别留一个空的深色小方块在画面左上角。
        previewStateContainer.isHidden = true
        previewStage.addSubview(previewStateContainer)

        previewStateLabel.font = .systemFont(ofSize: 10, weight: .medium)
        previewStateLabel.textColor = .white
        previewStateLabel.translatesAutoresizingMaskIntoConstraints = false
        previewStateContainer.addSubview(previewStateLabel)

        // ── 画面内的关闭按钮 ────────────────────────────
        previewCloseButton.title = ""
        previewCloseButton.image = NSImage(
            systemSymbolName: "xmark",
            accessibilityDescription: "关闭预览"
        )
        previewCloseButton.bezelStyle = .rounded
        previewCloseButton.font = .systemFont(ofSize: 12)
        previewCloseButton.toolTip = "关闭预览"
        previewCloseButton.setAccessibilityLabel("关闭预览")
        previewCloseButton.target = self
        previewCloseButton.action = #selector(dismissPreview(_:))
        previewCloseButton.translatesAutoresizingMaskIntoConstraints = false
        previewStage.addSubview(previewCloseButton)

        previewRetryButton.title = "重试"
        previewRetryButton.bezelStyle = .rounded
        previewRetryButton.isHidden = true
        previewRetryButton.target = self
        previewRetryButton.action = #selector(retryPreview)
        previewRetryButton.translatesAutoresizingMaskIntoConstraints = false
        previewStage.addSubview(previewRetryButton)

    }

    /// 画面下方：一行信息 + 「设为桌面壁纸」按钮。
    private func buildPreviewFooter() {
        previewInfoLabel.font = .systemFont(ofSize: 12)
        previewInfoLabel.lineBreakMode = .byTruncatingTail
        previewInfoLabel.maximumNumberOfLines = 1
        // **让文字先被压缩，而不是按钮**。实测 85 字的标题会把按钮压成 0 宽 ——
        // 两者默认压缩阻力相同，Auto Layout 就会去压按钮。标题本来就该截尾，
        // 按钮没了却是功能性的损失。
        previewInfoLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        previewInfoLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)
        previewInfoLabel.translatesAutoresizingMaskIntoConstraints = false
        previewPanel.addSubview(previewInfoLabel)

        pinButton.title = "设为桌面壁纸"
        pinButton.bezelStyle = .rounded
        pinButton.target = self
        pinButton.action = #selector(pinPreviewedItem)
        // 与上面成对：按钮**拒绝**被压缩，宁可让标题截尾。
        pinButton.setContentCompressionResistancePriority(.required, for: .horizontal)
        pinButton.setContentHuggingPriority(.required, for: .horizontal)
        pinButton.translatesAutoresizingMaskIntoConstraints = false
        previewPanel.addSubview(pinButton)

    }

    /// 浮层的全部约束。
    ///
    /// **集中在一处**而不是各构建方法里就近写：这些视图由三个方法分别创建，而约束互相引用
    /// （面板宽度、画面区的 9:16、信息行与按钮的相对位置），拆开写就看不出整体的布局意图了。
    private func activatePreviewOverlayConstraints() {
        // 宽度用**常量**约束（具体值在 `viewDidLayout` 里按网格区宽度夹取）。
        // 不要写成 `panel.width == overlay.width - 80`：那种等式是双向的，
        // Auto Layout 会为了满足它反过来把网格区压窄 —— 实测窗口被从 1060 压到 778
        // （778 = 旧分类栏 138 + 网格 640，而 640 = 560 + 80），甚至压到了 minSize 880 以下。
        panelWidthConstraint = previewPanel.widthAnchor.constraint(
            equalToConstant: Self.overlayMaxWidth
        )

        NSLayoutConstraint.activate([
            previewOverlay.leadingAnchor.constraint(equalTo: gridScroll.leadingAnchor),
            previewOverlay.trailingAnchor.constraint(equalTo: gridScroll.trailingAnchor),
            previewOverlay.topAnchor.constraint(equalTo: gridScroll.topAnchor),
            previewOverlay.bottomAnchor.constraint(equalTo: gridScroll.bottomAnchor),

            previewBackdrop.leadingAnchor.constraint(equalTo: previewOverlay.leadingAnchor),
            previewBackdrop.trailingAnchor.constraint(equalTo: previewOverlay.trailingAnchor),
            previewBackdrop.topAnchor.constraint(equalTo: previewOverlay.topAnchor),
            previewBackdrop.bottomAnchor.constraint(equalTo: previewOverlay.bottomAnchor),

            previewPanel.centerXAnchor.constraint(equalTo: previewOverlay.centerXAnchor),
            previewPanel.centerYAnchor.constraint(equalTo: previewOverlay.centerYAnchor),
            panelWidthConstraint,

            // 画面高度 = 宽 × 9/16（用乘数约束而不是写死常量，窗口缩放时自动跟上）
            previewStage.topAnchor.constraint(equalTo: previewPanel.topAnchor),
            previewStage.leadingAnchor.constraint(equalTo: previewPanel.leadingAnchor),
            previewStage.trailingAnchor.constraint(equalTo: previewPanel.trailingAnchor),
            previewStage.heightAnchor.constraint(
                equalTo: previewStage.widthAnchor,
                multiplier: 9.0 / 16.0
            ),

            previewImageView.topAnchor.constraint(equalTo: previewStage.topAnchor),
            previewImageView.leadingAnchor.constraint(equalTo: previewStage.leadingAnchor),
            previewImageView.trailingAnchor.constraint(equalTo: previewStage.trailingAnchor),
            previewImageView.bottomAnchor.constraint(equalTo: previewStage.bottomAnchor),

            previewPlayer.view.topAnchor.constraint(equalTo: previewStage.topAnchor),
            previewPlayer.view.leadingAnchor.constraint(equalTo: previewStage.leadingAnchor),
            previewPlayer.view.trailingAnchor.constraint(equalTo: previewStage.trailingAnchor),
            previewPlayer.view.bottomAnchor.constraint(equalTo: previewStage.bottomAnchor),

            previewPlaceholderLabel.centerXAnchor.constraint(equalTo: previewStage.centerXAnchor),
            previewPlaceholderLabel.centerYAnchor.constraint(equalTo: previewStage.centerYAnchor),

            previewStateContainer.centerXAnchor.constraint(equalTo: previewStage.centerXAnchor),
            previewStateContainer.centerYAnchor.constraint(equalTo: previewStage.centerYAnchor, constant: -18),
            previewStateLabel.topAnchor.constraint(equalTo: previewStateContainer.topAnchor, constant: 2),
            previewStateLabel.bottomAnchor.constraint(equalTo: previewStateContainer.bottomAnchor, constant: -2),
            previewStateLabel.leadingAnchor.constraint(equalTo: previewStateContainer.leadingAnchor, constant: 5),
            previewStateLabel.trailingAnchor.constraint(equalTo: previewStateContainer.trailingAnchor, constant: -5),

            previewCloseButton.topAnchor.constraint(equalTo: previewStage.topAnchor, constant: 8),
            previewCloseButton.trailingAnchor.constraint(equalTo: previewStage.trailingAnchor, constant: -8),
            previewCloseButton.widthAnchor.constraint(equalToConstant: 28),
            previewCloseButton.heightAnchor.constraint(equalToConstant: 28),

            previewRetryButton.topAnchor.constraint(equalTo: previewStateContainer.bottomAnchor, constant: 8),
            previewRetryButton.centerXAnchor.constraint(equalTo: previewStage.centerXAnchor),

            previewInfoLabel.topAnchor.constraint(equalTo: previewStage.bottomAnchor, constant: 10),
            previewInfoLabel.leadingAnchor.constraint(equalTo: previewPanel.leadingAnchor, constant: Self.panelPadding),
            previewInfoLabel.bottomAnchor.constraint(equalTo: previewPanel.bottomAnchor, constant: -10),

            pinButton.centerYAnchor.constraint(equalTo: previewInfoLabel.centerYAnchor),
            pinButton.trailingAnchor.constraint(equalTo: previewPanel.trailingAnchor, constant: -Self.panelPadding),
            pinButton.leadingAnchor.constraint(
                greaterThanOrEqualTo: previewInfoLabel.trailingAnchor,
                constant: Self.panelPadding
            ),
        ])
    }

    /// 浮层当前展示的条目。
    private var previewItem: WallpaperItem? {
        guard let previewItemID else { return nil }
        return items.first { $0.id == previewItemID }
    }

    /// 双击打开预览浮层。
    ///
    /// 做成 internal 是给探针留的口子：从 shell 里造不出真的 `NSEvent`，
    /// 「双击那一下」只能人工点，但**打开之后发生了什么**是可以验的。
    func openPreview(forItemAt indexPath: IndexPath) {
        guard indexPath.item < items.count else { return }
        openPreview(forItem: items[indexPath.item])
    }

    /// Hover 按钮与双击共用的预览入口。
    private func openPreview(forItem item: WallpaperItem) {
        previewItemID = item.id
        previewOverlay.isHidden = false
        updatePreviewPanel()
        // 双击是明确的「我要看这一条」→ 直接开播。这与「选中即自动播」是两回事：
        // 后者会让方向键连翻几条就把每条视频都拉一遍 —— 决策 4 要防的就是那个。
        previewPlayer.play(item)
    }

    /// 关掉浮层并释放播放器。点 ✕ / 点背景 / Esc / 切分类都走这里。
    @objc func dismissPreview(_ sender: Any?) {
        guard !previewOverlay.isHidden else { return }
        previewItemID = nil
        previewOverlay.isHidden = true
        // 用 `teardown()` 而不是 `stop()`：浮层都没了，状态该回到 `.idle`
        // （`stop()` 停在 `.cover`，会留一个不属于任何条目的静态图）。
        previewPlayer.teardown()
        previewImageView.image = nil
        previewPlaceholderLabel.isHidden = false
        setPreviewStateText("")
    }

    /// 刷新浮层里的文案与按钮状态。
    private func updatePreviewPanel() {
        guard let item = previewItem else {
            // 条目已经不在列表里了（切分类 / 重载）→ 直接关掉，别留一个空浮层。
            dismissPreview(nil)
            return
        }
        previewInfoLabel.stringValue = BrowserItemView.infoLine(for: item)

        let isCurrent = item.id == dataSource?.browserPinnedItemID
        // 已固定的那条：按钮变禁用的「当前桌面壁纸」，**不提供取消固定**（决策 11）——
        // 解钉出口只留菜单里的三处。
        pinButton.isEnabled = !isCurrent
        pinButton.title = isCurrent ? "当前桌面壁纸" : "设为桌面壁纸"

        loadPreviewCover(for: item)
    }

    private func loadPreviewCover(for item: WallpaperItem) {
        loader.load([item], variant: .preview, replacingPending: false) { [weak self] loaded, image in
            guard let self, self.previewItemID == loaded.id else { return }
            self.previewImageView.image = image
            self.previewPlaceholderLabel.isHidden = image != nil
        }
    }

    private func applyPreviewState(_ state: PreviewPlayer.State) {
        switch state {
        case .idle:
            previewPlayer.view.isHidden = true
            previewImageView.isHidden = false
            setPreviewStateText("")
            previewRetryButton.isHidden = true
        case .loading:
            // 起播期间保留静态封面，避免网络慢时只看到黑屏。
            previewPlayer.view.isHidden = true
            previewImageView.isHidden = false
            setPreviewStateText("正在加载动态预览…")
            previewRetryButton.isHidden = true
        case .playing:
            previewPlayer.view.isHidden = false
            previewImageView.isHidden = true
            setPreviewStateText("")
            previewRetryButton.isHidden = true
        case .failed(_, let reason):
            previewPlayer.view.isHidden = true
            previewImageView.isHidden = false
            setPreviewStateText("动态预览不可用：\(reason)")
            previewRetryButton.isHidden = false
        }
    }

    private func setPreviewStateText(_ text: String) {
        previewStateLabel.stringValue = text
        previewStateContainer.isHidden = text.isEmpty
    }

    @objc private func retryPreview() {
        guard let item = previewItem else { return }
        loadPreviewCover(for: item)
        previewPlayer.play(item)
    }

    // 刻意**不提供**停止/暂停入口：弹窗打开即自动播放，且不可暂停或停止
    // （星哥要求）。要停下来就关掉弹窗 —— 关窗会走 `teardown()` 释放播放器。

    @objc private func pinPreviewedItem() {
        guard let item = previewItem, let dataSource else { return }
        // 分类传**当前列表所属的分类**：用户是在这个分类里挑的，
        // 解钉之后的轮换该落在它上面（决策 7）。
        dataSource.browserSetPinned(item, categoryID: selectedCategoryID ?? 0)
        // 立刻更新按钮与徽标：落实是同步写配置的（真源马上可用），
        // 只有桌面画面要等视频加载完。
        updatePreviewPanel()
        refreshVisibleBadges()
    }

    @objc private func retryLoadItems() {
        guard let selectedCategoryID else { return }
        // **必须先清失败表**：缩略图加载器把「两级候选都失败」的地址记进失败表并
        // 永久跳过（那是防坏地址占并发位，是对的），但瞬时故障（一次超时 / DNS 抖动）
        // 也会被同样记住。不清的话这次重试只会重新请求「没失败过」的那些，
        // 用户点完「重试」发现那批卡片还是「无预览图」。
        loader.retryFailed()
        loadItems(for: selectedCategoryID)
    }

    // MARK: - 数据

    private func loadItems(for categoryID: Int) {
        guard let dataSource else { return }
        sliceGeneration += 1
        let generation = sliceGeneration

        items = []
        // 切分类时把预览浮层关掉：旧分类的条目马上就不在列表里了，
        // 留着浮层会变成「显示一条已经不存在的条目」。
        dismissPreview(nil)
        collectionView.reloadData()
        updateGridPlaceholder(message: "正在加载分类…", showSpinner: true)

        dataSource.browserLoadItems(for: categoryID) { [weak self] result in
            guard let self, generation == self.sliceGeneration else {
                self?.log?("丢弃过期的浏览分类结果（id \(categoryID)）")
                return
            }
            switch result {
            case .success(let loaded):
                self.items = loaded
                self.reloadGrid()
                self.updateGridPlaceholder(
                    message: loaded.isEmpty ? "该分类暂无内容" : nil,
                    showSpinner: false
                )
                self.log?("浏览窗口：分类 \(categoryID) 载入 \(loaded.count) 条")
            case .failure(let failure):
                self.items = []
                self.collectionView.reloadData()
                self.updateGridPlaceholder(message: failure.message, showSpinner: false, canRetry: true)
                self.log?("⚠️ 浏览窗口：分类 \(categoryID) 加载失败（\(failure.message)）")
            }
        }
    }

    // MARK: - 缩略图

    @objc private func gridBoundsDidChange() {
        applyGridWidth(gridScroll.contentView.bounds.width)

        // 滚动中不发请求：每次 bounds 变化都重置这个 120ms 的计时器，
        // 于是只有停下来之后才会真正去要图。快速滚过 3536 条不该产生 3536 个请求。
        thumbnailDebounce?.invalidate()
        thumbnailDebounce = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: false) { [weak self] _ in
            // 定时器块的类型是 `@Sendable`（`RunLoop.main` 上的定时器并不参与隔离推断），
            // 回跳一层把「这段确实在主 actor 上」写给编译器看。防抖的 120ms 之外
            // 多一个 runloop 的延迟，对「停下来才去要图」这个用途没有影响。
            Task { @MainActor in self?.loadVisibleThumbnails(replacingPending: true) }
        }
    }

    private func loadVisibleThumbnails(replacingPending: Bool) {
        guard !items.isEmpty else { return }
        let targets = collectionView.indexPathsForVisibleItems()
            .sorted()
            .compactMap { $0.item < items.count ? items[$0.item] : nil }
        guard !targets.isEmpty else { return }

        loader.load(targets, variant: .grid, replacingPending: replacingPending) { [weak self] item, image in
            guard let key = ThumbnailURL.grid(for: item)?.absoluteString else { return }
            self?.applyThumbnail(image, key: key)
        }
    }

    /// 把缩略图贴到卡片上。
    ///
    /// 按 **key 反查可见卡片**，而不是缓存一份「key → 索引」的映射：
    /// 可见项只有几十个，而映射表要在每次数据变化时重建、还得处理重复 key。
    /// `item(at:)` 只返回**可见**的卡片 —— 滚出屏幕的自然拿不到，正是想要的。
    private func applyThumbnail(_ image: NSImage?, key: String) {
        for indexPath in collectionView.indexPathsForVisibleItems() {
            guard indexPath.item < items.count,
                  ThumbnailURL.grid(for: items[indexPath.item])?.absoluteString == key,
                  let card = collectionView.item(at: indexPath) as? BrowserItemView
            else { continue }
            card.setThumbnail(image, key: key)
        }
    }

    private func refreshVisibleBadges() {
        let pinnedID = dataSource?.browserPinnedItemID
        for indexPath in collectionView.indexPathsForVisibleItems() {
            guard indexPath.item < items.count,
                  let card = collectionView.item(at: indexPath) as? BrowserItemView
            else { continue }
            card.updateCurrentBadge(items[indexPath.item].id == pinnedID)
        }
    }
}

// MARK: - 左栏数据源

extension WallpaperBrowserViewController: NSTableViewDataSource, NSTableViewDelegate {

    func numberOfRows(in tableView: NSTableView) -> Int { categories.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard row < categories.count else { return nil }
        let identifier = NSUserInterfaceItemIdentifier("CategoryCell")
        let cell: NSTableCellView
        if let reused = tableView.makeView(withIdentifier: identifier, owner: self) as? NSTableCellView {
            cell = reused
        } else {
            cell = NSTableCellView()
            cell.identifier = identifier
            let label = NSTextField(labelWithString: "")
            label.font = .systemFont(ofSize: Self.categoryFontSize)
            label.lineBreakMode = .byTruncatingTail
            label.translatesAutoresizingMaskIntoConstraints = false
            cell.addSubview(label)
            cell.textField = label
            NSLayoutConstraint.activate([
                label.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 12),
                label.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -12),
                label.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            ])
        }
        let entry = categories[row]
        cell.textField?.stringValue = entry.name
        // 条目数为 0 的分类照样列出、但**置灰不可点** —— 与菜单同一套规则
        // （`CategoryMenu.entries` 的 `isEnabled`）。
        cell.alphaValue = entry.itemCount > 0 ? 1 : 0.35
        return cell
    }

    func tableView(_ tableView: NSTableView, shouldSelectRow row: Int) -> Bool {
        guard row < categories.count else { return false }
        return categories[row].itemCount > 0
    }

    func tableViewSelectionDidChange(_ notification: Notification) {
        let row = categoryTable.selectedRow
        guard row >= 0, row < categories.count else { return }
        let id = categories[row].id
        guard id != selectedCategoryID else { return }
        // UI 内切分类**只换列表数据，不写配置** —— 只有「设为桌面壁纸」才写（决策 7）。
        // 于是「在窗口里翻了一圈别的分类」不会改变桌面正在播什么。
        selectedCategoryID = id
        loadItems(for: id)
    }
}

// MARK: - 右栏数据源

extension WallpaperBrowserViewController: NSCollectionViewDataSource, NSCollectionViewDelegateFlowLayout {

    func collectionView(_ collectionView: NSCollectionView, numberOfItemsInSection section: Int) -> Int {
        items.count
    }

    func collectionView(
        _ collectionView: NSCollectionView,
        itemForRepresentedObjectAt indexPath: IndexPath
    ) -> NSCollectionViewItem {
        let reused = collectionView.makeItem(withIdentifier: BrowserItemView.identifier, for: indexPath)
        guard let card = reused as? BrowserItemView, indexPath.item < items.count else { return reused }
        let item = items[indexPath.item]
        // 缩略图统一交给异步加载（缓存命中的会在同一个 runloop 内同步回调），
        // 这里只给「当前」标记。
        card.configure(
            with: item,
            isCurrent: item.id == dataSource?.browserPinnedItemID,
            thumbnail: nil
        )
        card.onPreviewRequested = { [weak self] item in
            self?.openPreview(forItem: item)
        }
        return card
    }

    func collectionView(
        _ collectionView: NSCollectionView,
        layout collectionViewLayout: NSCollectionViewLayout,
        sizeForItemAt indexPath: IndexPath
    ) -> NSSize {
        gridItemSize()
    }

    // 刻意**不实现** `didSelectItemsAt` / `didDeselectItemsAt`：这两个回调此前存在的
    // 唯一理由是驱动右栏（选中的条目 → 右栏显示它的预览与按钮）。右栏移除之后
    // 没有消费者了 —— 网格高亮由 `NSCollectionView` 自己管，预览只认「双击」
    // （见 `previewItemID`）。留着这两个空回调只会让人以为选中态还有别的副作用。
}
