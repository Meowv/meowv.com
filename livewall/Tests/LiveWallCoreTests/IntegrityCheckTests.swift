import Foundation
import LiveWallCore

/// 自身完整性校验（`Seal` —— 类型名刻意混淆，见该类型说明）。
///
/// 这组断言的重点不是「能不能抓到篡改」（那需要伪造签名，不适合放进单测），
/// 而是**不误报** —— 误报会让正常用户以为 App 被动过手脚，是这个功能最大的风险面。
func integrityCheckTests() {
    suite("自身完整性校验") {

        test("路径不存在时判「无法判定」，而不是「被篡改」") {
            let missing = URL(fileURLWithPath: "/definitely/not/here-\(UUID().uuidString)")
            let verdict = Seal.read(missing)
            if case .undetermined = verdict {
                expect(true, "不存在的路径应判 undetermined")
            } else {
                expect(false, "不存在的路径应判 undetermined，实际 \(verdict)")
            }
        }

        test("无签名的普通目录判「无法判定」") {
            let verdict = Seal.read(URL(fileURLWithPath: NSTemporaryDirectory()))
            if case .undetermined = verdict {
                expect(true, "普通目录应判 undetermined")
            } else {
                expect(false, "普通目录应判 undetermined，实际 \(verdict)")
            }
        }

        test("校验自己不得误报为「被篡改」") {
            guard let executable = Bundle.main.executableURL else {
                expect(false, "取不到测试进程自身的可执行文件路径")
                return
            }
            // arm64 上链接器会自动 ad-hoc 签名，正常应 trusted；
            // 换个环境（未签名构建）也可能是 undetermined —— 两者都正常。
            // 唯一不能出现的是 modified：那意味着误报。
            let verdict = Seal.read(executable)
            if case .modified(let reason) = verdict {
                expect(false, "校验自身被误判为 modified：\(reason)")
            } else {
                expect(true, "校验自身未误报为 modified（实际 \(verdict)）")
            }
        }
    }
}
