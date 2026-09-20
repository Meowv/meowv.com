import AppKit
import LiveWallCore

/// 网格里的一张卡片：缩略图 + **一行**信息（`标题 · 作者 · 时长 · 分辨率`），
/// 右上角可带「当前」徽标。
///
/// **卡片内不放按钮** —— 网格里每格塞按钮既挤又容易点错，操作集中在双击打开的
/// 预览浮层里（`AGENTS.md` 里对「置灰 / 集中入口」的既有取舍）。
///
/// 卡片是**被复用**的：同一个 view 会先后显示不同的条目。所以异步结果回来时必须
/// 比对 key（见 `setThumbnail(_:key:)`），否则会闪出上一条的图。
final class BrowserItemView: NSCollectionViewItem {

    static let identifier = NSUserInterfaceItemIdentifier("BrowserItemView")

    /// 缩略图下方的**一行信息**占的高度（8pt 间距 + 15pt 文字 + 3pt 底距）。
    ///
    /// 标题与作者合并成一行之后从 40 收到 26：少掉的是第二行文字的高度
    /// （约 14pt）与它的行间距（1pt）。
    static let infoHeight: CGFloat = 26

    /// 按列宽算卡片尺寸：缩略图（宽 × 9/16）+ 一行信息。
    ///
    /// 卡片宽度**不再固定**：网格按列数把可用宽度均分，卡片跟着撑满所在列
    /// （固定 186 会在右侧留一条空白）。
    static func cardSize(fittingWidth width: CGFloat) -> NSSize {
        NSSize(width: width, height: width * 9.0 / 16.0 + infoHeight)
    }

    /// 当前承载的条目。异步结果回来时用来判断「是不是还在说同一条」。
    private(set) var item: WallpaperItem?
    /// 缩略图请求的 key（拼好的缩略图 URL）。复用后与回调里的 key 比对。
    private(set) var thumbnailKey: String?

    private let thumbnailContainer = NSView()
    /// 刻意**不叫 `imageView`** —— `NSCollectionViewItem` 已经有一个同名属性
    /// （给 nib 用的 outlet），重名会直接编译不过。
    private let thumbnailView = NSImageView()
    private let placeholderLabel = NSTextField(labelWithString: "无预览图")
    private let hoverOverlay = NSView()
    private let previewButton = NSButton()
    private let liveIndicator = NSView()
    private let liveIconView = NSImageView()
    private let badgeContainer = NSView()
    private let badgeLabel = NSTextField(labelWithString: "当前")
    /// 单行信息：`标题 · 作者 · 时长 · 分辨率`。
    ///
    /// 刻意**只有一行**（标题与作者不再分两行）：分两行会挤掉缩略图的高度，
    /// 而作者只是次要信息。超出部分截尾，不换行、不折行。
    private let infoLabel = NSTextField(labelWithString: "")
    private var trackingArea: NSTrackingArea?

    /// Hover 预览入口。双击仍然由网格处理，但不再是唯一的可发现入口。
    var onPreviewRequested: ((WallpaperItem) -> Void)?

    override func loadView() {
        view = NSView()
        view.wantsLayer = true
        view.layer?.cornerRadius = 10
        view.layer?.borderWidth = 1
        view.layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.35).cgColor
        view.layer?.backgroundColor = NSColor.controlBackgroundColor.cgColor
        view.layer?.shadowColor = NSColor.black.cgColor
        view.layer?.shadowOpacity = 0.08
        view.layer?.shadowRadius = 5
        view.layer?.shadowOffset = CGSize(width: 0, height: -1)

        // ── 缩略图 ────────────────────────────────────────
        thumbnailContainer.wantsLayer = true
        thumbnailContainer.layer?.cornerRadius = 10
        thumbnailContainer.layer?.masksToBounds = true
        // 画面区固定深底：图片多为深色系，浅底会在图片加载完之前闪一下白。
        thumbnailContainer.layer?.backgroundColor = NSColor.black.cgColor
        thumbnailContainer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(thumbnailContainer)

        thumbnailView.imageScaling = .scaleProportionallyUpOrDown
        thumbnailView.translatesAutoresizingMaskIntoConstraints = false
        thumbnailContainer.addSubview(thumbnailView)

        placeholderLabel.font = .systemFont(ofSize: 11)
        placeholderLabel.textColor = .secondaryLabelColor
        placeholderLabel.alignment = .center
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
        thumbnailContainer.addSubview(placeholderLabel)

        // Hover 时只显示一个低干扰的预览入口，不让整张卡片变成一堆按钮。
        hoverOverlay.wantsLayer = true
        hoverOverlay.layer?.cornerRadius = 10
        hoverOverlay.layer?.masksToBounds = true
        hoverOverlay.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.22).cgColor
        hoverOverlay.isHidden = true
        hoverOverlay.translatesAutoresizingMaskIntoConstraints = false
        thumbnailContainer.addSubview(hoverOverlay)

        previewButton.title = ""
        previewButton.image = NSImage(
            systemSymbolName: "play.fill",
            accessibilityDescription: "预览动态壁纸"
        )
        previewButton.imagePosition = .imageOnly
        previewButton.isBordered = false
        previewButton.contentTintColor = .white
        previewButton.toolTip = "预览动态壁纸"
        previewButton.setAccessibilityLabel("预览动态壁纸")
        previewButton.target = self
        previewButton.action = #selector(requestPreview)
        previewButton.translatesAutoresizingMaskIntoConstraints = false
        hoverOverlay.addSubview(previewButton)

        // 所有条目都是动态壁纸，左上角用 SF Symbol 做一个轻量动态标识。
        liveIndicator.wantsLayer = true
        liveIndicator.layer?.cornerRadius = 4
        liveIndicator.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.52).cgColor
        liveIndicator.translatesAutoresizingMaskIntoConstraints = false
        thumbnailContainer.addSubview(liveIndicator)

        liveIconView.image = NSImage(
            systemSymbolName: "play.fill",
            accessibilityDescription: "动态视频"
        )
        liveIconView.contentTintColor = .white
        liveIconView.imageScaling = .scaleProportionallyDown
        liveIconView.translatesAutoresizingMaskIntoConstraints = false
        liveIndicator.addSubview(liveIconView)

        // ── 「当前」徽标 ──────────────────────────────────
        badgeContainer.wantsLayer = true
        badgeContainer.layer?.cornerRadius = 4
        badgeContainer.layer?.backgroundColor = NSColor.controlAccentColor.cgColor
        badgeContainer.translatesAutoresizingMaskIntoConstraints = false
        badgeContainer.isHidden = true
        view.addSubview(badgeContainer)

        badgeLabel.font = .systemFont(ofSize: 10, weight: .semibold)
        badgeLabel.textColor = .white
        badgeLabel.translatesAutoresizingMaskIntoConstraints = false
        badgeContainer.addSubview(badgeLabel)

        // ── 一行信息 ──────────────────────────────────────
        infoLabel.font = .systemFont(ofSize: 12)
        infoLabel.textColor = .labelColor
        infoLabel.lineBreakMode = .byTruncatingTail
        infoLabel.maximumNumberOfLines = 1
        // 卡片高度是按「一行」算好的，绝不能让它折行 —— 折行会顶掉下面的内容。
        infoLabel.cell?.isScrollable = false
        infoLabel.cell?.wraps = false
        infoLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(infoLabel)

        NSLayoutConstraint.activate([
            thumbnailContainer.topAnchor.constraint(equalTo: view.topAnchor),
            thumbnailContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            thumbnailContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            // 高度 = 宽 × 9/16，用乘数约束而不是写死常量 —— 卡片宽度随列数变化，
            // 写死就会和网格算出来的尺寸对不上。
            thumbnailContainer.heightAnchor.constraint(equalTo: view.widthAnchor, multiplier: 9.0 / 16.0),

            thumbnailView.topAnchor.constraint(equalTo: thumbnailContainer.topAnchor),
            thumbnailView.leadingAnchor.constraint(equalTo: thumbnailContainer.leadingAnchor),
            thumbnailView.trailingAnchor.constraint(equalTo: thumbnailContainer.trailingAnchor),
            thumbnailView.bottomAnchor.constraint(equalTo: thumbnailContainer.bottomAnchor),

            placeholderLabel.centerXAnchor.constraint(equalTo: thumbnailContainer.centerXAnchor),
            placeholderLabel.centerYAnchor.constraint(equalTo: thumbnailContainer.centerYAnchor),

            hoverOverlay.topAnchor.constraint(equalTo: thumbnailContainer.topAnchor),
            hoverOverlay.leadingAnchor.constraint(equalTo: thumbnailContainer.leadingAnchor),
            hoverOverlay.trailingAnchor.constraint(equalTo: thumbnailContainer.trailingAnchor),
            hoverOverlay.bottomAnchor.constraint(equalTo: thumbnailContainer.bottomAnchor),

            previewButton.centerXAnchor.constraint(equalTo: hoverOverlay.centerXAnchor),
            previewButton.centerYAnchor.constraint(equalTo: hoverOverlay.centerYAnchor),
            previewButton.widthAnchor.constraint(equalToConstant: 32),
            previewButton.heightAnchor.constraint(equalToConstant: 32),

            liveIndicator.topAnchor.constraint(equalTo: thumbnailContainer.topAnchor, constant: 6),
            liveIndicator.leadingAnchor.constraint(equalTo: thumbnailContainer.leadingAnchor, constant: 6),
            liveIndicator.widthAnchor.constraint(equalToConstant: 22),
            liveIndicator.heightAnchor.constraint(equalToConstant: 22),
            liveIconView.centerXAnchor.constraint(equalTo: liveIndicator.centerXAnchor),
            liveIconView.centerYAnchor.constraint(equalTo: liveIndicator.centerYAnchor),
            liveIconView.widthAnchor.constraint(equalToConstant: 11),
            liveIconView.heightAnchor.constraint(equalToConstant: 11),

            badgeContainer.topAnchor.constraint(equalTo: view.topAnchor, constant: 6),
            badgeContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -6),
            badgeLabel.topAnchor.constraint(equalTo: badgeContainer.topAnchor, constant: 1),
            badgeLabel.bottomAnchor.constraint(equalTo: badgeContainer.bottomAnchor, constant: -1),
            badgeLabel.leadingAnchor.constraint(equalTo: badgeContainer.leadingAnchor, constant: 5),
            badgeLabel.trailingAnchor.constraint(equalTo: badgeContainer.trailingAnchor, constant: -5),

            // 固定 15pt 而不是让它自己撑：卡片总高是按「一行」算好的，
            // 一旦折行就会顶出卡片边界。
            infoLabel.topAnchor.constraint(equalTo: thumbnailContainer.bottomAnchor, constant: 8),
            infoLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
            infoLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -8),
            infoLabel.heightAnchor.constraint(equalToConstant: 15),
        ])

        trackingArea = NSTrackingArea(
            rect: .zero,
            options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        if let trackingArea { view.addTrackingArea(trackingArea) }
    }

    override var isSelected: Bool {
        didSet { updateSelectionAppearance() }
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        // 复用前先清空：不清的话，上一条的缩略图会在新数据到达前一直显示着 ——
        // 快速滚动时看起来就是「图全错位了」。
        item = nil
        thumbnailKey = nil
        thumbnailView.image = nil
        placeholderLabel.isHidden = false
        hoverOverlay.isHidden = true
        onPreviewRequested = nil
    }

    /// 绑定一个条目。
    ///
    /// - Parameter thumbnail: 已经在缓存里的缩略图。缓存未命中时传 nil，
    ///   由调用方随后走异步加载再调 `setThumbnail(_:key:)`。
    func configure(with item: WallpaperItem, isCurrent: Bool, thumbnail: NSImage?) {
        self.item = item
        self.thumbnailKey = ThumbnailURL.grid(for: item)?.absoluteString
        infoLabel.stringValue = Self.infoLine(for: item)
        badgeContainer.isHidden = !isCurrent
        setThumbnail(thumbnail)
        updateSelectionAppearance()
    }

    override func mouseEntered(with event: NSEvent) {
        super.mouseEntered(with: event)
        hoverOverlay.isHidden = false
        view.layer?.borderColor = NSColor.controlAccentColor.withAlphaComponent(0.7).cgColor
    }

    override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        hoverOverlay.isHidden = true
        updateSelectionAppearance()
    }

    @objc private func requestPreview() {
        guard let item else { return }
        onPreviewRequested?(item)
    }

    /// 异步缩略图结果。**必须带 key** —— 卡片可能已经被复用去显示别的条目了。
    func setThumbnail(_ image: NSImage?, key: String) {
        guard key == thumbnailKey else { return }
        setThumbnail(image)
    }

    /// 只更新「当前」徽标。
    ///
    /// 单独一个方法而不是重跑 `configure`：重设缩略图会让已经加载好的图闪一下，
    /// 而固定状态变化与图本身无关。
    func updateCurrentBadge(_ isCurrent: Bool) {
        badgeContainer.isHidden = !isCurrent
    }

    private func setThumbnail(_ image: NSImage?) {
        thumbnailView.image = image
        // 取不到就显示占位文案，而不是留一块空白 —— 空白看起来像「还在加载」。
        placeholderLabel.isHidden = image != nil
    }

    private func updateSelectionAppearance() {
        let color = isSelected
            ? NSColor.controlAccentColor
            : NSColor.separatorColor.withAlphaComponent(0.35)
        let width: CGFloat = isSelected ? 2 : 1
        view.layer?.borderColor = color.cgColor
        view.layer?.borderWidth = width
        view.layer?.backgroundColor = isSelected
            ? NSColor.controlAccentColor.withAlphaComponent(0.06).cgColor
            : NSColor.controlBackgroundColor.cgColor
    }

    /// 单行信息：`标题 · 作者 · 时长 · 分辨率`。
    ///
    /// **标题与作者合并成一行**（不再分两行），卡片与预览浮层共用这一条。
    /// 信息按「有才显示」的原则拼 —— 缺项就跳过，**不编造占位值**
    /// （清单里的 `durationSeconds` 当前恒为 nil，编一个「0:10」是假信息）。
    static func infoLine(for item: WallpaperItem) -> String {
        var parts: [String] = [item.title.isEmpty ? "未命名" : item.title]
        if !item.author.isEmpty { parts.append(item.author) }
        // 清单里的 `durationSeconds` 当前恒为 nil，`concise` 对非法值也返回 nil ——
        // 缺就不显示，**不编造**一个「0:10」。
        if let duration = item.durationSeconds, let text = DurationText.concise(duration) {
            parts.append(text)
        }
        if let resolution = resolution(from: item) {
            parts.append(resolution)
        }
        return parts.joined(separator: " · ")
    }

    /// 从标题里抽 `4K` / `1080P` 之类的分辨率档位。
    ///
    /// 清单里**没有**分辨率的独立字段，但标题几乎都带（实测 21137 条里绝大多数形如
    /// 「… 4K」）。抽不到就返回 nil —— 卡片只是少一段文字，不会显示错的东西。
    static func resolution(from item: WallpaperItem) -> String? {
        let text = "\(item.title) \(item.tags.joined(separator: " "))".uppercased()
        for token in ["8K", "4K", "2K", "1080P", "720P"] where text.contains(token) {
            return token
        }
        return nil
    }
}
