/// 每屏源记忆的恢复：把 `config.json` 里记的「这块屏上次播的是哪一条」变成可执行的计划。
///
/// 抽成纯函数的原因：这里唯一容易出错的是**记住的条目可能已经不在当前候选集里**。
/// 候选集是**当前分类**的切片，所以用户换过分类、或生成侧重新导出过清单之后，
/// 旧的条目 id 多半已经不在了。那种屏必须**退回正常取片**，
/// 而不是拿着一个查不到的 id 去取、让那块屏空着。
///
/// 「恢复」只在**本次启动第一次成功加载清单**时做一次，之后的定时切换一律走正常取片 ——
/// 这个时机由调用方（`AppDelegate.advance`）控制，不在这里。
public enum ScreenSourceRestore {

    /// 算出可以恢复的计划：`displayID → 条目 id`。
    ///
    /// - Parameter candidateIDs: 当前候选集里的全部条目 id。
    ///   不在其中的记录**直接丢弃**（不进计划）。
    public static func plan(store: ScreenSourceStore, candidateIDs: Set<Int>) -> [UInt32: Int] {
        store.entries.filter { candidateIDs.contains($0.value) }
    }
}
