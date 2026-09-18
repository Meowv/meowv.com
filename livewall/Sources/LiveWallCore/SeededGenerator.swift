import Foundation

/// 可复现的伪随机数生成器（splitmix64）。
///
/// 生产环境用系统随机源即可，但候选池的「一轮内不重复」必须能确定性验证，
/// 否则测试只能靠概率，容易偶发失败。
public struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64

    public init(seed: UInt64) {
        // 0 会让 splitmix64 退化成常数序列，换一个非零初值
        self.state = seed == 0 ? 0x9E37_79B9_7F4A_7C15 : seed
    }

    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
