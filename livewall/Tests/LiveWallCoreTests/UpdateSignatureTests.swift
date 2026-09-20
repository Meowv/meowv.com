import CryptoKit
import Foundation
import LiveWallCore

/// 更新清单的**独立密钥验签**（Ed25519）。
///
/// ## 这组测试里最要紧的一条是「固定向量」
///
/// 下面那个签名是用**真实的发布私钥**签出来的（`tools/sign-version.swift sign`）。
/// 它的作用是当**绊线**：谁动了 `UpdateSignature.publicKeyBase64`（换密钥、改坏、
/// 被截断），这条断言立刻红。
///
/// 为什么值得专门留一条：内嵌公钥是客户端里**唯一的信任锚**，它悄悄变了而没人发现，
/// 整套签名机制就静默失效了 —— 症状是「客户端永远不提示更新」，与「线上没发新版」
/// 长得一模一样，排障会往完全错误的方向走。
///
/// 私钥不在仓库里（`~/.livewall-signing/version-key.txt`），所以**换密钥时这条向量
/// 必须重新生成**，命令见 `livewall/README.md`。
private let fixturePayload = #"{"version":"9.9.9","build":999,"sha256":"0000000000000000000000000000000000000000000000000000000000000000","fileURL":"https://studio.meowv.com/data/livewall/LiveWall-9.9.9.dmg"}"#

/// 上面那份字节由**发布私钥**签出的签名（Ed25519，64 字节的 base64）。
private let fixtureSignature = "0ddx0XZXXGhobdgwCYKCjS2NFBfiU53FWuT5PvbU+lwwym5HGcugJ0i1so1OQjigHjNCctzdW3IsQ0UbxeTGDg=="

/// 拼一份签名文件。形状与 `tools/sign-version.swift` 写出的一致。
private func signatureDocument(
    alg: String = "ed25519",
    signature: String = fixtureSignature
) -> Data {
    Data(#"{"alg":"\#(alg)","signature":"\#(signature)"}"#.utf8)
}

/// 断言判为拒绝，且原因里含某个关键词。
///
/// 不直接比整串：原因文案是给用户看的，会改。但**「必须有原因、且原因能区分情形」**
/// 这件事不能改 —— 手动点「检查更新」时这几行字就是排障的唯一线索，
/// 全都写成同一句「校验失败」等于没提示。
private func expectRejected(
    _ outcome: UpdateSignature.Outcome,
    contains keyword: String,
    _ label: String
) {
    guard case .rejected(let reason) = outcome else {
        expect(false, "\(label) —— 期望判为拒绝，实际 \(outcome)")
        return
    }
    expect(reason.contains(keyword), "\(label) —— 原因应含「\(keyword)」，实际「\(reason)」")
}

func updateSignatureTests() {

    // MARK: - 信任锚

    suite("更新签名：信任锚") {

        test("内嵌公钥可解析，且是 32 字节（Ed25519 的固定长度）") {
            expectNotNil(UpdateSignature.publicKey, "内嵌公钥必须能解析")
            expectEqual(
                Data(base64Encoded: UpdateSignature.publicKeyBase64)?.count,
                32,
                "Ed25519 公钥是 32 字节"
            )
            expectEqual(UpdateSignature.algorithm, "ed25519", "算法标识")
        }

        test("固定向量：发布私钥签出的签名必须验得过") {
            // ⚠️ 这条红了，第一嫌疑是 publicKeyBase64 被换过（见文件顶部说明），
            //    而不是密码学出了问题。
            expectEqual(
                UpdateSignature.verify(payload: Data(fixturePayload.utf8), document: signatureDocument()),
                .trusted,
                "内嵌公钥应认得发布私钥签出的签名"
            )
        }

        test("固定向量本身是合规的：长度对、能解析成完整版本信息") {
            // 防的是「向量被编辑器折行 / 手抖改了一个字符」这种意外 ——
            // 那时上面那条会红，但原因会指向公钥，方向就偏了。这条先把它钉住。
            expectEqual(Data(fixturePayload.utf8).count, 177, "固定向量的字节数")
            expectEqual(
                Data(base64Encoded: fixtureSignature)?.count,
                64,
                "签名解码后应是 64 字节"
            )

            var warnings: [String] = []
            let feed = UpdateFeedCoding.decode(Data(fixturePayload.utf8), into: &warnings)
            expectNotNil(feed, "固定向量应能解析成 UpdateFeed")
            expectEqual(feed?.build, 999, "build")
            expectEqual(feed?.version, "9.9.9", "version")
            expect(warnings.isEmpty, "固定向量是合规数据，不该产生 warning")
        }
    }

    // MARK: - 拒绝

    suite("更新签名：必须拒绝的情形") {

        test("清单被改一个字节就验不过") {
            // 这是整套机制存在的理由：能改 version.json 的人（静态站被入侵、
            // 发布脚本被改、CDN 被投毒）改不动签名。
            let tampered = fixturePayload.replacingOccurrences(of: "\"build\":999", with: "\"build\":998")
            expect(tampered != fixturePayload, "前提：替换确实改了内容")
            expectRejected(
                UpdateSignature.verify(payload: Data(tampered.utf8), document: signatureDocument()),
                contains: "不符",
                "改动后的清单"
            )
        }

        test("重新格式化清单（只加一个空格）也会失效 —— 签的是原始字节") {
            // 这不是缺陷，是刻意的：不做「解析出字段再拼规范串」那种规范化，
            // 就不会出现「两边实现不一致」的缝。代价是发布时必须原样上传。
            let reformatted = fixturePayload.replacingOccurrences(of: "\"version\"", with: "\"version\" ")
            expect(reformatted != fixturePayload, "前提：替换确实改了内容")
            expectRejected(
                UpdateSignature.verify(payload: Data(reformatted.utf8), document: signatureDocument()),
                contains: "不符",
                "重新格式化后的清单"
            )
        }

        test("换一把密钥签的签名不认 —— 证明用的确实是内嵌公钥") {
            // 少了这条，一个「任何签名都放行」的实现也能让上面所有正例通过。
            let otherKey = Curve25519.Signing.PrivateKey()
            guard let foreign = try? otherKey.signature(for: Data(fixturePayload.utf8)) else {
                expect(false, "前提：临时密钥应能签名")
                return
            }
            expect(
                Data(base64Encoded: UpdateSignature.publicKeyBase64) != otherKey.publicKey.rawRepresentation,
                "前提：临时密钥不是发布密钥"
            )
            expectRejected(
                UpdateSignature.verify(
                    payload: Data(fixturePayload.utf8),
                    document: signatureDocument(signature: foreign.base64EncodedString())
                ),
                contains: "不符",
                "别人签的"
            )
        }

        test("签名格式问题一律拒绝，且原因能区分情形") {
            let cases: [(Data, String, String)] = [
                (Data("not json at all".utf8), "不是 JSON", "签名文件不是 JSON"),
                (Data("".utf8), "不是 JSON", "签名文件是空的"),
                (Data("[]".utf8), "根节点", "根节点是数组"),
                (Data(#"{"signature":"x"}"#.utf8), "算法", "缺 alg"),
                (signatureDocument(alg: "rsa"), "算法", "alg 不是 ed25519"),
                (signatureDocument(alg: "Ed25519"), "算法", "大小写不符也算不受支持"),
                (Data(#"{"alg":"ed25519"}"#.utf8), "signature", "缺 signature"),
                (signatureDocument(signature: ""), "signature", "签名字段为空"),
                (signatureDocument(signature: "!!!!"), "长度", "全是垃圾字符，解码后为空"),
                (signatureDocument(signature: "AAAA"), "长度", "合法 base64 但太短"),
            ]
            for (document, keyword, label) in cases {
                expectRejected(
                    UpdateSignature.verify(payload: Data(fixturePayload.utf8), document: document),
                    contains: keyword,
                    label
                )
            }
        }

        test("空清单一律拒绝") {
            expectRejected(
                UpdateSignature.verify(payload: Data(), document: signatureDocument()),
                contains: "不符",
                "零字节的清单"
            )
        }
    }

    // MARK: - 组合入口

    suite("更新签名：验签 + 解析的组合入口") {

        test("验签通过才交给解析，能解出完整信息") {
            var warnings: [String] = []
            let feed = UpdateFeedCoding.decodeVerified(
                payload: Data(fixturePayload.utf8),
                signatureDocument: signatureDocument(),
                into: &warnings
            )
            expectNotNil(feed, "验签通过应解出 UpdateFeed")
            expectEqual(feed?.build, 999, "build")
            expect(warnings.isEmpty, "一切正常时不该有 warning")
        }

        test("验签不过就不解析 —— 不退回只看 sha256") {
            // 降级路径等于没做签名：攻击者把签名文件删掉即可绕过。
            let tampered = Data(fixturePayload.replacingOccurrences(of: "999", with: "998").utf8)
            var warnings: [String] = []
            let feed = UpdateFeedCoding.decodeVerified(
                payload: tampered,
                signatureDocument: signatureDocument(),
                into: &warnings
            )
            expectNil(feed, "验签不过必须判不可用，而不是拿解析结果继续")
            expect(
                warnings.contains { $0.contains("签名校验失败") },
                "原因要指明是签名问题，实际：\(warnings)"
            )
        }

        test("签名文件是空的（漏传 .sig）也判不可用，且原因指向签名") {
            var warnings: [String] = []
            expectNil(
                UpdateFeedCoding.decodeVerified(
                    payload: Data(fixturePayload.utf8),
                    signatureDocument: Data(),
                    into: &warnings
                ),
                "没有签名文件不能放行"
            )
            expect(!warnings.isEmpty, "必须有 warning")
        }
    }

    // MARK: - 地址推导

    suite("更新签名：签名文件地址推导") {

        test("常规地址：版本信息同名加 .sig") {
            expectEqual(
                UpdateSignature.documentURL(for: URL(string: "https://a.b/c/version.json")!)?.absoluteString,
                "https://a.b/c/version.json.sig",
                "与线上实际使用的地址形状一致"
            )
            expectEqual(
                UpdateSignature.documentURL(for: URL(string: "https://studio.meowv.com/data/livewall/version.json")!)?.absoluteString,
                "https://studio.meowv.com/data/livewall/version.json.sig",
                "线上真实地址"
            )
        }

        test("查询串原样保留") {
            expectEqual(
                UpdateSignature.documentURL(for: URL(string: "https://a.b/version.json?v=2")!)?.absoluteString,
                "https://a.b/version.json.sig?v=2",
                "带查询串时不能把它丢掉"
            )
        }

        test("目录地址推不出来 —— 宁可判不可用，也不猜一个地址") {
            // 猜错的表现是「拉到一个不存在的位置」，比直接说「地址不像文件」更难排障。
            expectNil(UpdateSignature.documentURL(for: URL(string: "https://a.b/")!), "根路径")
            expectNil(UpdateSignature.documentURL(for: URL(string: "https://a.b")!), "没有路径")
            expectNil(UpdateSignature.documentURL(for: URL(string: "https://a.b/dir/")!), "以 / 结尾")
        }
    }
}
