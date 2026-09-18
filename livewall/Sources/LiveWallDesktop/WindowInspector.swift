import AppKit
import CoreGraphics
import Foundation
import LiveWallCore

/// 一条屏幕窗口记录。只读取不涉及屏幕录制权限的字段（owner / layer / bounds / pid / number），
/// 刻意不读 kCGWindowName —— 那个字段在 macOS 10.15+ 需要屏幕录制授权。
public struct WindowRecord: Sendable {
    /// 在列表中的位置，0 = 最前
    public let index: Int
    public let layer: Int
    public let ownerName: String
    public let pid: Int
    public let windowNumber: Int
    public let bounds: CGRect

    public var boundsText: String {
        String(format: "%.0f,%.0f %.0fx%.0f", bounds.origin.x, bounds.origin.y, bounds.width, bounds.height)
    }

    public init(index: Int, layer: Int, ownerName: String, pid: Int, windowNumber: Int, bounds: CGRect) {
        self.index = index
        self.layer = layer
        self.ownerName = ownerName
        self.pid = pid
        self.windowNumber = windowNumber
        self.bounds = bounds
    }
}

/// 层级判定结果。
public struct LayerVerdict: Sendable {
    public var ourLevel: Int = 0
    public var ourIndex: Int?
    public var wallpaperRecord: WindowRecord?
    public var iconRecord: WindowRecord?
    public var isAboveWallpaper: Bool?
    public var isBelowIcons: Bool?
    public var coversScreen: Bool = false
    /// 与本程序处在同一层级、且同样覆盖整屏的其它窗口。
    /// 同层前后顺序由 WindowServer 决定，不由我们控制 —— 这是真实的产品风险。
    public var competingWindows: [WindowRecord] = []
    public var notes: [String] = []

    public init() {}

    /// 层级是否完全符合要求：在系统壁纸之上、桌面图标之下、覆盖整屏、无同层竞争。
    public var isHealthy: Bool {
        isAboveWallpaper == true && isBelowIcons == true && coversScreen && competingWindows.isEmpty
    }

    public var summary: String {
        var parts: [String] = []
        parts.append("层级 \(ourLevel)")
        if let above = isAboveWallpaper {
            parts.append(above ? "在系统壁纸之上 ✓" : "被系统壁纸盖住 ✗")
        } else {
            parts.append("系统壁纸层未知")
        }
        if let below = isBelowIcons {
            parts.append(below ? "在图标之下 ✓" : "盖住图标")
        } else {
            parts.append("图标层未知")
        }
        parts.append(coversScreen ? "覆盖整屏 ✓" : "未覆盖整屏 ✗")
        if !competingWindows.isEmpty {
            parts.append("同层竞争 \(competingWindows.count) 个 ⚠")
        }
        return parts.joined(separator: " | ")
    }
}

public enum WindowInspector {

    public static var desktopLevel: Int { Int(CGWindowLevelForKey(.desktopWindow)) }
    public static var iconLevel: Int { Int(CGWindowLevelForKey(.desktopIconWindow)) }

    /// 屏幕上的窗口快照，顺序为前 -> 后（与 CGWindowListCopyWindowInfo 一致）。
    public static func snapshot() -> [WindowRecord] {
        guard let raw = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] else {
            return []
        }
        return raw.enumerated().map { index, info in
            let owner = info[kCGWindowOwnerName as String] as? String ?? "?"
            let layer = info[kCGWindowLayer as String] as? Int ?? 0
            let pid = info[kCGWindowOwnerPID as String] as? Int ?? 0
            let number = info[kCGWindowNumber as String] as? Int ?? 0
            var rect = CGRect.zero
            if let dict = info[kCGWindowBounds as String] as? [String: Any],
               let parsed = CGRect(dictionaryRepresentation: dict as CFDictionary) {
                rect = parsed
            }
            return WindowRecord(index: index, layer: layer, ownerName: owner, pid: pid, windowNumber: number, bounds: rect)
        }
    }

    /// 打印完整层级表。层级顺序只能真机实测，读代码看不出来 —— 这是排障的第一手材料。
    public static func printTable(highlightPIDs: Set<Int> = []) {
        let records = snapshot()
        print("")
        print("窗口层级快照（顺序 = 前 → 后，共 \(records.count) 个）")
        print("desktopWindow = \(desktopLevel)   desktopIconWindow = \(iconLevel)")
        print(TextLayout.pad("#", 5) + TextLayout.pad("layer", 14) + TextLayout.pad("owner", 26) + TextLayout.pad("bounds", 24) + "win#")
        print(String(repeating: "-", count: 96))
        for record in records {
            var mark = ""
            if highlightPIDs.contains(record.pid) { mark = "  ★ 本进程" }
            else if record.layer <= iconLevel && record.layer >= desktopLevel - 4 { mark = "  ← 桌面层区间" }
            print(TextLayout.padLeft("\(record.index)", 5)
                  + TextLayout.padLeft("\(record.layer)", 14)
                  + TextLayout.pad(record.ownerName, 26)
                  + TextLayout.pad(record.boundsText, 24)
                  + "#\(record.windowNumber)"
                  + mark)
        }
        print("")
    }

    /// 桌面层区间内的窗口，按 layer 从高到低排列。
    public static func desktopBandRecords() -> [WindowRecord] {
        snapshot()
            .filter { $0.layer <= iconLevel && $0.layer >= desktopLevel - 12 }
            .sorted { $0.layer > $1.layer }
    }

    /// 系统壁纸窗口。
    ///
    /// 踩过的坑：用 `contains("wallpaper")` 做宽松匹配会把第三方壁纸软件
    /// （例如本机在跑的 "Dynamic Wallpaper"）误判成系统壁纸，从而得出错误的
    /// 「在系统壁纸之上」结论。所以这里只做**精确名字匹配**，匹配不到再走兜底启发式。
    ///
    /// 系统壁纸进程名会随系统语言本地化：中文系统下是「墙纸」。
    public static func findWallpaperRecord(in records: [WindowRecord], excludingPIDs: Set<Int>) -> WindowRecord? {
        let band = records.filter {
            !excludingPIDs.contains($0.pid)
            && $0.layer <= desktopLevel + 8
            && $0.layer >= desktopLevel - 12
            && coversAnyScreen($0.bounds)
        }

        // 1) 精确名字：系统壁纸进程在各语言下的名字
        let exactNames: Set<String> = ["墙纸", "wallpaper", "wallpaperagent", "wallpapervideoextension", "idleassets"]
        if let exact = band.first(where: { exactNames.contains($0.ownerName.lowercased()) }) {
            return exact
        }

        // 2) 兜底：桌面层区间内 layer 最小、覆盖整屏、且不属于 WindowServer 的窗口
        //    实测系统壁纸位于 desktopWindow - 2，是桌面层里最靠后的一层。
        return band
            .filter { !$0.ownerName.lowercased().contains("window server") && $0.layer < desktopLevel }
            .min { $0.layer < $1.layer }
    }

    /// 桌面图标层窗口。Finder 的桌面窗口正好落在 desktopIconWindow 这一层。
    public static func findIconRecord(in records: [WindowRecord], excludingPIDs: Set<Int>) -> WindowRecord? {
        records.first {
            !excludingPIDs.contains($0.pid) && $0.layer == iconLevel && coversAnyScreen($0.bounds)
        }
    }

    public static func coversAnyScreen(_ rect: CGRect) -> Bool {
        guard rect.width > 1, rect.height > 1 else { return false }
        for screen in NSScreen.screens {
            guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { continue }
            let displayBounds = CGDisplayBounds(CGDirectDisplayID(number.uint32Value))
            // 允许 Dock / 菜单栏造成的高度差，宽度必须基本吻合
            if abs(rect.width - displayBounds.width) <= 4 && rect.height >= displayBounds.height * 0.9 {
                return true
            }
        }
        return false
    }

    /// 计算判定结果。`ourWindowNumbers` 是本进程创建的窗口号集合。
    public static func evaluate(ourLevel: Int, ourWindowNumbers: Set<Int>) -> LayerVerdict {
        let records = snapshot()
        var verdict = LayerVerdict()
        verdict.ourLevel = ourLevel

        let ourPID = Int(ProcessInfo.processInfo.processIdentifier)
        let excludingPIDs: Set<Int> = [ourPID]

        let ours = records.filter { ourWindowNumbers.contains($0.windowNumber) }
        if let first = ours.first {
            verdict.ourIndex = first.index
            verdict.coversScreen = !ours.isEmpty && ours.allSatisfy { coversAnyScreen($0.bounds) }
        } else {
            verdict.notes.append("未能在窗口列表中找到本进程窗口（可能被系统合并或未上屏）")
        }

        let wallpaper = findWallpaperRecord(in: records, excludingPIDs: excludingPIDs)
        let icon = findIconRecord(in: records, excludingPIDs: excludingPIDs)
        verdict.wallpaperRecord = wallpaper
        verdict.iconRecord = icon

        // 同层竞争：别的进程也有同层、覆盖整屏的窗口。同层前后顺序不由我们决定。
        verdict.competingWindows = records.filter {
            !excludingPIDs.contains($0.pid)
            && $0.layer == ourLevel
            && coversAnyScreen($0.bounds)
        }
        if !verdict.competingWindows.isEmpty {
            let names = Set(verdict.competingWindows.map(\.ownerName)).sorted().joined(separator: "、")
            verdict.notes.append("同层竞争：\(names) 也占用层级 \(ourLevel) 且覆盖整屏。同层前后顺序由 WindowServer 决定，可能出现互相遮挡或闪烁。")
        }

        // 判定优先用 layer 比较；同层时退回列表顺序比较，并显式标注顺序不可靠。
        if let wallpaper {
            if ourLevel != wallpaper.layer {
                verdict.isAboveWallpaper = ourLevel > wallpaper.layer
            } else if let ourIndex = verdict.ourIndex {
                verdict.isAboveWallpaper = ourIndex < wallpaper.index
                verdict.notes.append("本窗口与系统壁纸同层，结论依赖列表顺序，不可靠。")
            }
        } else {
            verdict.notes.append("未识别出系统壁纸窗口，无法判定「是否在壁纸之上」")
        }

        if let icon {
            if ourLevel != icon.layer {
                verdict.isBelowIcons = ourLevel < icon.layer
            } else if let ourIndex = verdict.ourIndex {
                verdict.isBelowIcons = ourIndex > icon.index
            }
        } else {
            verdict.notes.append("未识别出桌面图标窗口，无法判定「是否在图标之下」")
        }

        if let ourIndex = verdict.ourIndex, let icon, ourIndex < icon.index {
            verdict.notes.append("当前窗口排在图标层之前，会遮挡桌面图标")
        }

        return verdict
    }

    // MARK: - 遮挡检测

    /// 指定显示器内、所有「会遮住画面的不透明窗口」矩形。
    ///
    /// 过滤条件：`layer >= 0`（排除桌面层与状态栏层）、`alpha >= 0.99`
    /// （半透明窗口看得见底下的壁纸，不该算遮挡）。
    public static func opaqueCoverRects(within displayBounds: CGRect, excludingPIDs: Set<Int>) -> [CGRect] {
        guard let raw = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] else {
            return []
        }
        var rects: [CGRect] = []
        for info in raw {
            let pid = info[kCGWindowOwnerPID as String] as? Int ?? 0
            if excludingPIDs.contains(pid) { continue }
            let layer = info[kCGWindowLayer as String] as? Int ?? 0
            if layer < 0 { continue }
            let alpha = info[kCGWindowAlpha as String] as? Double ?? 1
            if alpha < 0.99 { continue }
            guard let dict = info[kCGWindowBounds as String] as? [String: Any],
                  let rect = CGRect(dictionaryRepresentation: dict as CFDictionary) else { continue }
            let clipped = rect.intersection(displayBounds)
            if clipped.isNull || clipped.isEmpty { continue }
            rects.append(clipped)
        }
        return rects
    }

    /// 指定显示器是否被不透明窗口完全盖满。
    ///
    /// 面积计算交给 `LiveWallCore.CoverageGrid`（坐标压缩，精确值）。
    ///
    /// **早先的实现在这里有 bug**：它把所有窗口的交集做 `union`，再比较 union 的
    /// bounding box 面积。两个左右并排、各占半屏的窗口，bbox 合起来就是整屏，
    /// 于是明明看得见壁纸却被判定成「完全遮挡」。已改为精确面积法。
    public static func isScreenFullyCovered(
        displayBounds: CGRect,
        excludingPIDs: Set<Int>,
        threshold: Double = CoverageGrid.defaultThreshold
    ) -> Bool {
        let rects = opaqueCoverRects(within: displayBounds, excludingPIDs: excludingPIDs)
        return CoverageGrid.isFullyCovered(displayBounds, by: rects, threshold: threshold)
    }

    // MARK: - 工具

    // 文本对齐实现已迁到 LiveWallCore.TextLayout（纯逻辑，可单测）。这里保留转发，
    // 避免调用点全部改写。
    public static func displayWidth(_ value: String) -> Int { TextLayout.displayWidth(value) }
    public static func pad(_ value: String, _ width: Int) -> String { TextLayout.pad(value, width) }
    public static func padLeft(_ value: String, _ width: Int) -> String { TextLayout.padLeft(value, width) }
}
