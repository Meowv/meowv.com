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
    func browserLoadItems(
        for categoryID: Int,
        completion: @escaping (Result<[WallpaperItem], BrowserLoadFailure>) -> Void
    )

    /// 设为桌面壁纸。落实路径在 `AppDelegate.setPinned`。
    func browserSetPinned(_ item: WallpaperItem, categoryID: Int)
}

/// 动态壁纸浏览窗口的内容。
///
/// 三栏布局：左 = 分类，中 = 条目网格，右 = 预览 + 操作；底部一行状态。
/// 尺寸与取舍见 `AGENTS.md` 与 `livewall/README.md`。
final class WallpaperBrowserViewController: NSViewController {

    // 布局常量
    private static let categoryWidth: CGFloat = 138
    private static let detailWidth: CGFloat = 232
    private static let footerHeight: CGFloat = 26
    private static let gridInset: CGFloat = 12
    private static let cardSpacing: CGFloat = 12
    /// 预览画面区高度 = 宽 × 9/16。
    private static let previewStageHeight: CGFloat = (detailWidth - 24) * 9 / 16

    private weak var dataSource: WallpaperBrowserDataSource?

    // 左栏：分类
    private let categoryTable = NSTableView()
    private let categoryScroll = NSScrollView()

    // 中栏：条目网格
    private let collectionView = NSCollectionView()
    private let gridScroll = NSScrollView()
    private let gridPlaceholder = NSView()
    private let gridPlaceholderLabel = NSTextField(labelWithString: "")
    private let gridSpinner = NSProgressIndicator()
    private let gridRetryButton = NSButton()

    // 右栏：预览 + 操作
    private let detailPane = NSView()
    private let previewStage = NSView()
    private let previewImageView = NSImageView()
    private let previewPlaceholderLabel = NSTextField(labelWithString: "无预览图")
    private let previewStateContainer = NSView()
    private let previewStateLabel = NSTextField(labelWithString: "")
    private let detailTitleLabel = NSTextField(labelWithString: "")
    private let detailSubtitleLabel = NSTextField(wrappingLabelWithString: "")
    private let previewButton = NSButton()
    private let pinButton = NSButton()
    private let pinHintLabel = NSTextField(wrappingLabelWithString: "固定后所有屏幕都播这一条，不再自动轮换。")

    // 底栏
    private let footerLabel = NSTextField(labelWithString: "")

    // 状态
    private var categories: [LivewallCategoryEntry] = []
    private var items: [WallpaperItem] = []
    private var selectedCategoryID: Int?
    private var selectedItemID: Int?
    /// 分类切片请求序号。**独立于 `AppDelegate.sliceRequestGeneration`** ——
    /// 那个是播放用的，两者混用会让「浏览别的分类」把正在播的加载结果判成过期。
    private var sliceGeneration = 0
    private var isLoading = false

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

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("不支持从 nib 加载") }

    // MARK: - 生命周期

    override func loadView() {
        let root = NSView(frame: NSRect(x: 0, y: 0, width: 1060, height: 660))
        root.wantsLayer = true
        view = root

        buildCategoryColumn(in: root)
        buildGridColumn(in: root)
        buildDetailColumn(in: root)
        buildFooter(in: root)

        NSLayoutConstraint.activate([
            // 底栏横跨整宽，三栏在它上方
            footerLabel.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 12),
            footerLabel.topAnchor.constraint(equalTo: root.bottomAnchor, constant: -Self.footerHeight),
            footerLabel.bottomAnchor.constraint(equalTo: root.bottomAnchor),

            categoryScroll.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            categoryScroll.topAnchor.constraint(equalTo: root.topAnchor),
            categoryScroll.bottomAnchor.constraint(equalTo: footerLabel.topAnchor),
            categoryScroll.widthAnchor.constraint(equalToConstant: Self.categoryWidth),

            gridScroll.leadingAnchor.constraint(equalTo: categoryScroll.trailingAnchor),
            gridScroll.topAnchor.constraint(equalTo: root.topAnchor),
            gridScroll.bottomAnchor.constraint(equalTo: categoryScroll.bottomAnchor),
            gridScroll.trailingAnchor.constraint(equalTo: detailPane.leadingAnchor),
            gridScroll.widthAnchor.constraint(greaterThanOrEqualToConstant: 460),

            detailPane.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            detailPane.topAnchor.constraint(equalTo: root.topAnchor),
            detailPane.bottomAnchor.constraint(equalTo: categoryScroll.bottomAnchor),
            detailPane.widthAnchor.constraint(equalToConstant: Self.detailWidth),
        ])
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        previewPlayer.onStateChange = { [weak self] state in
            self?.applyPreviewState(state)
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
        updateDetailPane()
        // 初始状态是 `.idle`，不会触发 `onStateChange`（回调只在实际变化时发），
        // 所以这里显式同步一次，否则右栏的按钮文案要等第一次操作才对。
        applyPreviewState(previewPlayer.state)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    /// 关窗口时调用：停预览、取消在飞请求、停 debounce。
    ///
    /// **不动桌面播放**（决策 12）—— 浏览窗口只是「挑一张」的工具。
    func teardown() {
        previewPlayer.teardown()
        loader.cancelAll()
        thumbnailDebounce?.invalidate()
        thumbnailDebounce = nil
    }

    /// 固定项变了（菜单里固定 / 解钉之后）。只刷新徽标与右栏按钮，不动列表数据。
    func refreshPinState() {
        refreshVisibleBadges()
        updateDetailPane()
    }

    /// Esc 关窗。`NSViewController` 在响应链上，所以不按任何按钮时也能收到。
    override func cancelOperation(_ sender: Any?) {
        view.window?.performClose(nil)
    }

    // MARK: - 左栏：分类

    private func buildCategoryColumn(in root: NSView) {
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("Category"))
        column.resizingMask = .autoresizingMask
        categoryTable.addTableColumn(column)
        categoryTable.headerView = nil
        categoryTable.rowHeight = 24
        categoryTable.allowsEmptySelection = false
        categoryTable.allowsMultipleSelection = false
        categoryTable.selectionHighlightStyle = .regular
        categoryTable.dataSource = self
        categoryTable.delegate = self

        // 同 collection view：documentView 的尺寸由它自己管，只让宽度跟住滚动视图。
        // 先定 frame 再挂 documentView —— 反过来有些 AppKit 版本会用 clip view 的
        // 初始 bounds（0×0）把 documentView 的尺寸重置掉。
        categoryTable.frame = NSRect(x: 0, y: 0, width: Self.categoryWidth, height: 620)
        categoryTable.autoresizingMask = [.width]
        categoryScroll.documentView = categoryTable
        categoryScroll.hasVerticalScroller = true
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

    // MARK: - 中栏：条目网格

    private func buildGridColumn(in root: NSView) {
        let layout = NSCollectionViewFlowLayout()
        layout.itemSize = BrowserItemView.cardSize
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
        collectionView.backgroundColors = [.clear]
        collectionView.register(BrowserItemView.self, forItemWithIdentifier: BrowserItemView.identifier)

        // 刻意**不给 collection view 加 Auto Layout 约束**：它作为 documentView 时会
        // 按流式布局算出的内容高度改写自己的 frame，而 Auto Layout 会跟它抢这个值
        // （表现是「只能看到第一行」或「滚不动」）。给一个默认窗口尺寸下的非零初始
        // frame + 宽度自适应，剩下的交给它自己 —— 与 `NSTableView` 当 documentView
        // 是同一套机制。先定 frame 再挂 documentView。
        collectionView.frame = NSRect(x: 0, y: 0, width: 688, height: 620)
        collectionView.autoresizingMask = [.width]
        gridScroll.documentView = collectionView
        gridScroll.hasVerticalScroller = true
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

    // MARK: - 右栏：预览与操作

    private func buildDetailColumn(in root: NSView) {
        detailPane.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(detailPane)

        // ── 16:9 画面区 ───────────────────────────────────
        previewStage.wantsLayer = true
        previewStage.layer?.cornerRadius = 8
        previewStage.layer?.masksToBounds = true
        // 画面区固定深底：视频画面本来就该是深底，浅底还会在加载完之前闪一下白。
        previewStage.layer?.backgroundColor = NSColor.black.cgColor
        previewStage.translatesAutoresizingMaskIntoConstraints = false
        detailPane.addSubview(previewStage)

        previewImageView.imageScaling = .scaleProportionallyUpOrDown
        previewImageView.translatesAutoresizingMaskIntoConstraints = false
        previewStage.addSubview(previewImageView)

        previewPlaceholderLabel.font = .systemFont(ofSize: 11)
        previewPlaceholderLabel.textColor = .secondaryLabelColor
        previewPlaceholderLabel.alignment = .center
        previewPlaceholderLabel.translatesAutoresizingMaskIntoConstraints = false
        previewStage.addSubview(previewPlaceholderLabel)

        previewPlayer.view.translatesAutoresizingMaskIntoConstraints = false
        previewPlayer.view.isHidden = true
        previewStage.addSubview(previewPlayer.view)

        // 状态角标（静态图 / 播放中 / 加载中… / 资源不可用）。用容器而不是直接给
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

        // ── 文字与按钮 ────────────────────────────────────
        detailTitleLabel.font = .systemFont(ofSize: 13, weight: .semibold)
        detailTitleLabel.lineBreakMode = .byTruncatingTail
        detailTitleLabel.maximumNumberOfLines = 2
        detailTitleLabel.translatesAutoresizingMaskIntoConstraints = false
        detailPane.addSubview(detailTitleLabel)

        detailSubtitleLabel.font = .systemFont(ofSize: 11)
        detailSubtitleLabel.textColor = .secondaryLabelColor
        detailSubtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        detailPane.addSubview(detailSubtitleLabel)

        previewButton.title = "预览"
        previewButton.bezelStyle = .rounded
        previewButton.target = self
        previewButton.action = #selector(togglePreview)
        previewButton.translatesAutoresizingMaskIntoConstraints = false
        detailPane.addSubview(previewButton)

        pinButton.title = "设为桌面壁纸"
        pinButton.bezelStyle = .rounded
        pinButton.target = self
        pinButton.action = #selector(pinSelectedItem)
        pinButton.translatesAutoresizingMaskIntoConstraints = false
        detailPane.addSubview(pinButton)

        pinHintLabel.font = .systemFont(ofSize: 10)
        pinHintLabel.textColor = .tertiaryLabelColor
        pinHintLabel.translatesAutoresizingMaskIntoConstraints = false
        detailPane.addSubview(pinHintLabel)

        NSLayoutConstraint.activate([
            previewStage.topAnchor.constraint(equalTo: detailPane.topAnchor, constant: 12),
            previewStage.leadingAnchor.constraint(equalTo: detailPane.leadingAnchor, constant: 12),
            previewStage.trailingAnchor.constraint(equalTo: detailPane.trailingAnchor, constant: -12),
            previewStage.heightAnchor.constraint(equalToConstant: Self.previewStageHeight),

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

            previewStateContainer.topAnchor.constraint(equalTo: previewStage.topAnchor, constant: 6),
            previewStateContainer.leadingAnchor.constraint(equalTo: previewStage.leadingAnchor, constant: 6),
            previewStateLabel.topAnchor.constraint(equalTo: previewStateContainer.topAnchor, constant: 2),
            previewStateLabel.bottomAnchor.constraint(equalTo: previewStateContainer.bottomAnchor, constant: -2),
            previewStateLabel.leadingAnchor.constraint(equalTo: previewStateContainer.leadingAnchor, constant: 5),
            previewStateLabel.trailingAnchor.constraint(equalTo: previewStateContainer.trailingAnchor, constant: -5),

            detailTitleLabel.topAnchor.constraint(equalTo: previewStage.bottomAnchor, constant: 10),
            detailTitleLabel.leadingAnchor.constraint(equalTo: previewStage.leadingAnchor),
            detailTitleLabel.trailingAnchor.constraint(equalTo: previewStage.trailingAnchor),

            detailSubtitleLabel.topAnchor.constraint(equalTo: detailTitleLabel.bottomAnchor, constant: 3),
            detailSubtitleLabel.leadingAnchor.constraint(equalTo: detailTitleLabel.leadingAnchor),
            detailSubtitleLabel.trailingAnchor.constraint(equalTo: detailTitleLabel.trailingAnchor),

            previewButton.topAnchor.constraint(equalTo: detailSubtitleLabel.bottomAnchor, constant: 12),
            previewButton.leadingAnchor.constraint(equalTo: detailTitleLabel.leadingAnchor),
            previewButton.widthAnchor.constraint(equalToConstant: 76),

            pinButton.topAnchor.constraint(equalTo: previewButton.topAnchor),
            pinButton.leadingAnchor.constraint(equalTo: previewButton.trailingAnchor, constant: 8),
            pinButton.trailingAnchor.constraint(equalTo: detailTitleLabel.trailingAnchor),

            pinHintLabel.topAnchor.constraint(equalTo: previewButton.bottomAnchor, constant: 8),
            pinHintLabel.leadingAnchor.constraint(equalTo: detailTitleLabel.leadingAnchor),
            pinHintLabel.trailingAnchor.constraint(equalTo: detailTitleLabel.trailingAnchor),
        ])
    }

    private var selectedItem: WallpaperItem? {
        guard let selectedItemID else { return nil }
        return items.first { $0.id == selectedItemID }
    }

    private func updateDetailPane() {
        guard let item = selectedItem else {
            detailTitleLabel.stringValue = "未选择"
            detailSubtitleLabel.stringValue = "从中间的网格里挑一条"
            previewImageView.image = nil
            previewPlaceholderLabel.isHidden = false
            setPreviewStateText("")
            previewButton.isEnabled = false
            pinButton.isEnabled = false
            pinButton.title = "设为桌面壁纸"
            return
        }

        detailTitleLabel.stringValue = item.title.isEmpty ? "未命名" : item.title
        detailSubtitleLabel.stringValue = BrowserItemView.subtitle(for: item)

        let isCurrent = item.id == dataSource?.browserPinnedItemID
        // 已固定的那条：按钮变禁用的「当前桌面壁纸」，**不提供取消固定**（决策 11）——
        // 解钉出口只留菜单里的三处。
        pinButton.isEnabled = !isCurrent
        pinButton.title = isCurrent ? "当前桌面壁纸" : "设为桌面壁纸"

        previewButton.isEnabled = item.remoteURL != nil
        loadPreviewCover(for: item)
    }

    private func loadPreviewCover(for item: WallpaperItem) {
        loader.load([item], variant: .preview, replacingPending: false) { [weak self] loaded, image in
            guard let self, self.selectedItemID == loaded.id else { return }
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
            previewButton.title = "预览"
            previewButton.isEnabled = selectedItem?.remoteURL != nil
        case .cover:
            previewPlayer.view.isHidden = true
            previewImageView.isHidden = false
            setPreviewStateText(selectedItem == nil ? "" : "静态图")
            previewButton.title = "预览"
            previewButton.isEnabled = selectedItem?.remoteURL != nil
        case .loading:
            previewPlayer.view.isHidden = false
            previewImageView.isHidden = true
            setPreviewStateText("加载中…")
            previewButton.title = "停止预览"
            previewButton.isEnabled = true
        case .playing:
            previewPlayer.view.isHidden = false
            previewImageView.isHidden = true
            setPreviewStateText("播放中")
            previewButton.title = "停止预览"
            previewButton.isEnabled = true
        case .failed(_, let reason):
            previewPlayer.view.isHidden = true
            previewImageView.isHidden = false
            setPreviewStateText(reason)
            previewButton.title = "预览"
            // 地址不可用就不要再让人点第二次 —— 结果只会一样。
            previewButton.isEnabled = false
        }
    }

    private func setPreviewStateText(_ text: String) {
        previewStateLabel.stringValue = text
        previewStateContainer.isHidden = text.isEmpty
    }

    @objc private func togglePreview() {
        guard let item = selectedItem else { return }
        // 已经在弄这条（加载中或正在播）就停，否则开播。
        if previewPlayer.currentItemID == item.id {
            previewPlayer.stop()
        } else {
            previewPlayer.play(item)
        }
    }

    @objc private func pinSelectedItem() {
        guard let item = selectedItem, let dataSource else { return }
        // 分类传**当前列表所属的分类**：用户是在这个分类里挑的，
        // 解钉之后的轮换该落在它上面（决策 7）。
        dataSource.browserSetPinned(item, categoryID: selectedCategoryID ?? 0)
        // 立刻更新按钮与徽标：落实是同步写配置的（真源马上可用），
        // 只有桌面画面要等视频加载完。
        updateDetailPane()
        refreshVisibleBadges()
    }

    @objc private func retryLoadItems() {
        guard let selectedCategoryID else { return }
        loadItems(for: selectedCategoryID)
    }

    // MARK: - 底栏

    private func buildFooter(in root: NSView) {
        let separator = NSBox()
        separator.boxType = .separator
        separator.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(separator)

        footerLabel.font = .systemFont(ofSize: 11)
        footerLabel.textColor = .secondaryLabelColor
        footerLabel.lineBreakMode = .byTruncatingTail
        footerLabel.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(footerLabel)

        NSLayoutConstraint.activate([
            separator.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            separator.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            separator.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -Self.footerHeight),
            footerLabel.topAnchor.constraint(equalTo: separator.bottomAnchor),
            footerLabel.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            footerLabel.trailingAnchor.constraint(lessThanOrEqualTo: root.trailingAnchor, constant: -12),
        ])
    }

    private func updateFooter() {
        guard let selectedCategoryID else {
            footerLabel.stringValue = "清单里没有分类信息"
            return
        }
        let name = categories.first { $0.id == selectedCategoryID }?.name ?? "id \(selectedCategoryID)"
        if isLoading {
            footerLabel.stringValue = "\(name) · 正在加载…"
        } else {
            footerLabel.stringValue = "\(name) · 共 \(items.count) 条"
        }
    }

    // MARK: - 数据

    private func loadItems(for categoryID: Int) {
        guard let dataSource else { return }
        sliceGeneration += 1
        let generation = sliceGeneration

        isLoading = true
        items = []
        selectedItemID = nil
        // 切分类时把预览也停掉：旧分类的条目马上就不在列表里了。
        previewPlayer.teardown()
        collectionView.reloadData()
        updateGridPlaceholder(message: "正在加载分类…", showSpinner: true)
        updateFooter()
        updateDetailPane()

        dataSource.browserLoadItems(for: categoryID) { [weak self] result in
            guard let self, generation == self.sliceGeneration else {
                self?.log?("丢弃过期的浏览分类结果（id \(categoryID)）")
                return
            }
            self.isLoading = false
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
            self.updateFooter()
            self.updateDetailPane()
        }
    }

    // MARK: - 缩略图

    @objc private func gridBoundsDidChange() {
        // 滚动中不发请求：每次 bounds 变化都重置这个 120ms 的计时器，
        // 于是只有停下来之后才会真正去要图。快速滚过 3536 条不该产生 3536 个请求。
        thumbnailDebounce?.invalidate()
        thumbnailDebounce = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: false) { [weak self] _ in
            self?.loadVisibleThumbnails(replacingPending: true)
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
            label.font = .systemFont(ofSize: 12)
            label.lineBreakMode = .byTruncatingTail
            label.translatesAutoresizingMaskIntoConstraints = false
            cell.addSubview(label)
            cell.textField = label
            NSLayoutConstraint.activate([
                label.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 4),
                label.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -4),
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

// MARK: - 中栏数据源

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
        return card
    }

    func collectionView(
        _ collectionView: NSCollectionView,
        layout collectionViewLayout: NSCollectionViewLayout,
        sizeForItemAt indexPath: IndexPath
    ) -> NSSize {
        BrowserItemView.cardSize
    }

    func collectionView(_ collectionView: NSCollectionView, didSelectItemsAt indexPaths: Set<IndexPath>) {
        guard let indexPath = indexPaths.first, indexPath.item < items.count else { return }
        selectedItemID = items[indexPath.item].id
        // 换条目 → 停掉上一个的预览，回到静态图（决策 4：默认静态图）。
        previewPlayer.stop()
        updateDetailPane()
    }

    func collectionView(_ collectionView: NSCollectionView, didDeselectItemsAt indexPaths: Set<IndexPath>) {
        // 点空白处会取消选中（`allowsEmptySelection` 默认就是 true）。不处理这个回调的话，
        // 右栏会继续显示上一条、按钮照样可点 —— 网格上没有任何高亮，右栏却说「选中了这条」，
        // 而 `updateDetailPane()` 的「未选择」分支本来是设计好的，只是选中过一条之后就再也回不去。
        //
        // **只在真的变成空选中时才清**：切换选中时 AppKit 会先 deselect 再 select，
        // 无条件清空会把刚选中的那条擦掉（结果取决于两个回调的先后顺序，不能赌）。
        guard collectionView.selectionIndexes.isEmpty else { return }
        selectedItemID = nil
        // 用 `teardown()` 而不是 `stop()`：没有选中项就没有「静态图」可回，状态该是 `.idle`
        // （`stop()` 停在 `.cover`，会让右栏留着一个已经不属于任何条目的预览层）。
        previewPlayer.teardown()
        updateDetailPane()
    }
}
