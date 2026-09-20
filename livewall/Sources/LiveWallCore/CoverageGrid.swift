import Foundation

/// 判断一块矩形是否被若干窗口「完全盖满」，以及被覆盖的比例。
///
/// **为什么不用 union + bounding box**：早先的实现把所有窗口与屏幕的交集做
/// `union`，再比较 bbox 的面积。两个左右并排、各占屏幕 40% 的窗口，它们的
/// bbox 合起来就是整屏，会被误判成「完全遮挡」—— 壁纸在用户明明看得见的时候被暂停。
///
/// **为什么不用网格采样**：采样点会漏掉窄缝。实测 20px 的缝隙比一个 63px 的
/// 网格还窄，没有任何采样点落进去，于是报告「覆盖 100%」。这是系统性盲区，
/// 不是提高分辨率就能根治的（分辨率越高越慢，且总有更窄的缝）。
///
/// **实际采用坐标压缩法**：把屏幕按所有矩形的 x/y 边界切成若干小块，
/// 每块的边界都与矩形边界对齐，所以每块**要么整块在内、要么整块在外**，
/// 用块中心判定即可，结果是**精确面积**而不是近似值。
/// 矩形数通常不到 20，切分后的小块数在千级，每 2 秒算一次毫无压力。
public enum CoverageGrid {

    /// 允许 0.5% 的未覆盖面积 —— 窗口边缘的亚像素误差不该导致判定翻转。
    public static let defaultThreshold = 0.995

    /// 被覆盖的面积比例（0…1），精确值。
    ///
    /// 生产路径只走 `isFullyCovered`（达到阈值就提前返回）；这个是**精确值接口**，
    /// 供测试与调试使用 —— 与 `legacyBoundingBoxCovers` 同理。删掉它，
    /// 「左右各占 40% 的两个窗口覆盖率是 0.8 而不是 1.0」这类断言就只能退化成
    /// 布尔判定，验证强度会掉一档。
    public static func coverage(of bounds: CGRect, by rects: [CGRect]) -> Double {
        let total = bounds.width * bounds.height
        guard total > 0 else { return 0 }
        let clipped = clippedRects(bounds, rects)
        guard !clipped.isEmpty else { return 0 }
        return Double(coveredArea(of: bounds, by: clipped, stopAt: 0) / total)
    }

    /// 是否达到「完全盖满」的判定。累计面积达标即提前返回。
    public static func isFullyCovered(
        _ bounds: CGRect,
        by rects: [CGRect],
        threshold: Double = defaultThreshold
    ) -> Bool {
        let total = bounds.width * bounds.height
        guard total > 0 else { return false }
        let clamped = min(max(threshold, 0), 1)
        if clamped <= 0 { return true }

        let clipped = clippedRects(bounds, rects)
        guard !clipped.isEmpty else { return false }

        let target = total * CGFloat(clamped)
        return coveredArea(of: bounds, by: clipped, stopAt: target) >= target
    }

    /// 旧实现的等价物，**只用于对比测试**，不要在生产路径调用。
    ///
    /// 保留它是为了让「为什么必须换掉」这件事有一个可执行的证据：
    /// 同一个输入，旧实现返回 true，新实现返回 false。
    public static func legacyBoundingBoxCovers(_ bounds: CGRect, by rects: [CGRect]) -> Bool {
        var union = CGRect.null
        for rect in rects {
            let clipped = rect.intersection(bounds)
            if clipped.isNull || clipped.isEmpty { continue }
            union = union.union(clipped)
        }
        guard !union.isNull else { return false }
        let screenArea = bounds.width * bounds.height
        guard screenArea > 0 else { return false }
        return (union.width * union.height) / screenArea >= 0.999
    }

    // MARK: - 内部

    private static func clippedRects(_ bounds: CGRect, _ rects: [CGRect]) -> [CGRect] {
        rects.compactMap { rect in
            let clipped = rect.intersection(bounds)
            return (clipped.isNull || clipped.isEmpty) ? nil : clipped
        }
    }

    /// 坐标压缩后逐块累加被覆盖的面积。`stopAt > 0` 时达到目标即返回。
    private static func coveredArea(of bounds: CGRect, by clipped: [CGRect], stopAt: CGFloat) -> CGFloat {
        var xEdges: Set<CGFloat> = [bounds.minX, bounds.maxX]
        var yEdges: Set<CGFloat> = [bounds.minY, bounds.maxY]
        for rect in clipped {
            xEdges.insert(rect.minX)
            xEdges.insert(rect.maxX)
            yEdges.insert(rect.minY)
            yEdges.insert(rect.maxY)
        }
        let columns = xEdges.sorted()
        let rows = yEdges.sorted()

        var covered: CGFloat = 0
        for column in 0..<max(0, columns.count - 1) {
            let x0 = columns[column]
            let x1 = columns[column + 1]
            guard x1 > x0 else { continue }
            for row in 0..<max(0, rows.count - 1) {
                let y0 = rows[row]
                let y1 = rows[row + 1]
                guard y1 > y0 else { continue }
                // 块的边界与所有矩形边界对齐，所以块中心在内即代表整块在内
                let center = CGPoint(x: (x0 + x1) / 2, y: (y0 + y1) / 2)
                guard clipped.contains(where: { $0.contains(center) }) else { continue }
                covered += (x1 - x0) * (y1 - y0)
                if stopAt > 0, covered >= stopAt { return covered }
            }
        }
        return covered
    }
}
