import Foundation
import Security

/// 自身完整性校验：检查本 App 的代码签名是否与二进制自洽。
///
/// **能挡什么**：被就地改过、却没有重新签名的二进制；以及完全未签名的副本。
/// 实测：在签名覆盖区内改 1 字节且不重签 → 校验失败；从未签名 → 校验失败。
///
/// **挡不住什么**：改完再 `codesign --force --sign -` 重签。本 App 是 ad-hoc 签名，
/// 没有开发者证书作锚点，任何人都能重签出一份「校验通过」的副本（已实测确认）。
/// 所以它的定位是**抬高随手 patch 的门槛**，不是可靠的防篡改 —— 想要真正的锚，
/// 前提是上 Developer ID 正式签名 + 公证。
///
/// **处置原则：只报告、不阻断。** 误判的代价（用户整个壁纸功能失效）远大于收益，
/// 且真有决心的攻击者本来就绕得过。调用方按 `Outcome` 记日志即可，别拿它拦启动。
///
/// **类型名 `Seal` 是刻意混淆的，别「顺手改回来」。** 理由同 `Folded`：二进制里的
/// mangled name 会带上类型名，叫 `IntegrityCheck` 等于在 `strings` 输出里标出
/// 「这里是防篡改检查，改这里」。文件名保持描述性，类型名不透露用途。
public enum Seal {

    /// 校验结论。
    public enum Outcome: Equatable, Sendable {
        /// 签名与二进制自洽。
        case trusted
        /// 明确被改动过（签名校验失败）。
        case modified(String)
        /// 无法判定（路径不存在、读不出签名等）。**不等同于被篡改**。
        case undetermined(String)
    }

    /// 校验指定 bundle（或裸 Mach-O 文件）的代码签名。
    ///
    /// 用 `SecStaticCodeCheckValidity` 做静态校验：不联网、不校验证书链，
    /// 因此 ad-hoc 签名也能判「签名与二进制是否自洽」。
    public static func read(_ url: URL) -> Outcome {
        var staticCode: SecStaticCode?
        let createStatus = SecStaticCodeCreateWithPath(url as CFURL, [], &staticCode)
        guard createStatus == errSecSuccess, let staticCode else {
            return .undetermined("无法读取代码签名（OSStatus \(createStatus)）")
        }
        let checkStatus = SecStaticCodeCheckValidity(staticCode, [], nil)
        guard checkStatus == errSecSuccess else {
            return .modified("代码签名校验失败（OSStatus \(checkStatus)）")
        }
        return .trusted
    }

    /// 校验当前正在运行的这个 bundle。
    public static func readBundle() -> Outcome {
        read(Bundle.main.bundleURL)
    }
}
