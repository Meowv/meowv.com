import CryptoKit
import Foundation
import LiveWallCore

/// 内容清单的**完整性（sha256）与来源（Ed25519 签名）**。
///
/// 这组测试分两层：
///
/// - `ContentDigest` 与 `CatalogSignature.digestProblem` 是纯函数，直接断言；
/// - `CatalogSignature.verify` 走的是**内嵌公钥**，正例只能靠真实私钥签出的固定向量
///   （`SignedIndex`，定义在 `CatalogTests.swift`）。它是**绊线**：
///   谁动了 `UpdateSignature.publicKeyBase64`，这里会一起红。
func catalogSignatureTests() {

    // MARK: - 摘要

    suite("内容摘要：sha256") {

        test("标准向量：空串、abc、多字节字符（按字节而不是按字符）") {
            expectEqual(
                ContentDigest.sha256Hex(Data()),
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                "空字节的 sha256"
            )
            expectEqual(
                ContentDigest.sha256Hex(Data("abc".utf8)),
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                "abc 的 sha256"
            )
            // 「喵」在 UTF-8 下是 3 个字节 —— 摘要算的是**字节**，与生成侧（Python
            // 先 encode('utf-8') 再算）必须落在同一个口径上，否则中文分类名一动就全崩。
            expectEqual(
                ContentDigest.sha256Hex(Data("喵".utf8)),
                "be65e0d3685da8ac08344020fb2f0967fb3f1feb87f64db31e5088eb5690afa2",
                "「喵」的 sha256"
            )
            expectEqual(ContentDigest.sha256Hex(Data("喵".utf8)).count, ContentDigest.hexLength, "长度")
        }

        test("合法性：长度与字符集都要卡住") {
            expect(ContentDigest.isValid(String(repeating: "a", count: 64)), "64 个小写十六进制")
            expect(ContentDigest.isValid(String(repeating: "A", count: 64)), "大写也接受")
            expect(ContentDigest.isValid("0123456789abcdef" + String(repeating: "f", count: 48)), "混合数字与字母")
            expect(!ContentDigest.isValid(String(repeating: "a", count: 63)), "63 位太短")
            expect(!ContentDigest.isValid(String(repeating: "a", count: 65)), "65 位太长")
            expect(!ContentDigest.isValid(String(repeating: "g", count: 64)), "g 不是十六进制字符")
            expect(!ContentDigest.isValid(String(repeating: "喵", count: 64)), "非 ASCII")
            expect(!ContentDigest.isValid(String(repeating: "a", count: 64) + " "), "尾随空格")
            expect(!ContentDigest.isValid(""), "空串")
            expect(!ContentDigest.isValid(nil), "nil")
        }

        test("比对：缺摘要 / 摘要不合法一律判**不匹配**，不是「放行」") {
            // 这条是安全语义：把 hex 传成 nil 时若返回 true，攻击者删掉摘要字段即可绕过。
            let data = Data("hello".utf8)
            let digest = ContentDigest.sha256Hex(data)

            expect(ContentDigest.matches(data, hex: digest), "正常匹配")
            expect(ContentDigest.matches(data, hex: digest.uppercased()), "大小写不敏感")
            expect(!ContentDigest.matches(data, hex: ContentDigest.sha256Hex(Data("hello!".utf8))), "差一个字节")
            expect(!ContentDigest.matches(data, hex: nil), "没有摘要 ≠ 匹配")
            expect(!ContentDigest.matches(data, hex: ""), "空摘要 ≠ 匹配")
            expect(!ContentDigest.matches(data, hex: "abcd"), "太短 ≠ 匹配")
            expect(!ContentDigest.matches(data, hex: String(repeating: "z", count: 64)), "非十六进制 ≠ 匹配")
            expect(!ContentDigest.matches(Data(), hex: ContentDigest.sha256Hex(data)), "空数据不会匹配非空内容的摘要")
        }

        test("同内容同摘要、差一字节不同摘要") {
            let a = Data("同一个内容".utf8)
            let b = Data("同一个内容".utf8)
            let c = Data("同一个容".utf8)
            expectEqual(ContentDigest.sha256Hex(a), ContentDigest.sha256Hex(b), "同内容")
            expect(ContentDigest.sha256Hex(a) != ContentDigest.sha256Hex(c), "不同内容")
        }
    }

    // MARK: - 索引的摘要齐全性

    suite("索引：切片摘要必须齐全") {

        test("全部有切片的分类都带合法摘要 → 通过") {
            let index = LivewallCatalogIndex(
                schemaVersion: 1,
                generatedAt: "",
                source: CatalogSource(deviceType: "desktop", contentType: "dynamic", categoryName: nil, categoryIds: []),
                categories: [
                    LivewallCategoryEntry(id: 4001, name: "美女", file: "category.4001.json", itemCount: 2, sha256: String(repeating: "a", count: 64)),
                    LivewallCategoryEntry(id: 6000, name: "风景", file: "category.6000.json", itemCount: 1, sha256: String(repeating: "b", count: 64)),
                ]
            )
            expectNil(CatalogSignature.digestProblem(in: index), "应通过")
        }

        test("空分类（file 为 nil）不需要摘要") {
            // 服务端不会为空分类产出切片文件，也就没有摘要可言 —— 这里若判失败，
            // 那么「菜单里显示空分类」这个既有行为会连累整份索引不可用。
            let index = LivewallCatalogIndex(
                schemaVersion: 1,
                generatedAt: "",
                source: CatalogSource(deviceType: "desktop", contentType: "dynamic", categoryName: nil, categoryIds: []),
                categories: [
                    LivewallCategoryEntry(id: 6000, name: "分区", file: nil, itemCount: 0, sha256: nil),
                ]
            )
            expectNil(CatalogSignature.digestProblem(in: index), "空分类不该被追究")
        }

        test("有切片却没摘要 → 指名报出（这是硬约束，不是提醒）") {
            let index = LivewallCatalogIndex(
                schemaVersion: 1,
                generatedAt: "",
                source: CatalogSource(deviceType: "desktop", contentType: "dynamic", categoryName: nil, categoryIds: []),
                categories: [
                    LivewallCategoryEntry(id: 4001, name: "美女", file: "category.4001.json", itemCount: 2, sha256: nil),
                    LivewallCategoryEntry(id: 6000, name: "风景", file: "category.6000.json", itemCount: 1, sha256: String(repeating: "b", count: 64)),
                ]
            )
            let problem = CatalogSignature.digestProblem(in: index)
            expectNotNil(problem, "缺摘要必须被报出来")
            expect(problem?.contains("美女") == true, "要指名分类，实际：\(problem ?? "nil")")
            expect(problem?.contains("4001") == true, "带上 id，避免同名分类分不清")
            expect(problem?.contains("风景") == false, "有摘要的不该被牵连")
        }

        test("摘要长度不对（写了个短串）也算缺摘要") {
            let index = LivewallCatalogIndex(
                schemaVersion: 1,
                generatedAt: "",
                source: CatalogSource(deviceType: "desktop", contentType: "dynamic", categoryName: nil, categoryIds: []),
                categories: [
                    LivewallCategoryEntry(id: 4001, name: "美女", file: "category.4001.json", itemCount: 2, sha256: "abcdef"),
                ]
            )
            expectNotNil(CatalogSignature.digestProblem(in: index), "半截摘要不能当摘要用")
        }

        test("多个分类都缺摘要时全部报出") {
            let index = LivewallCatalogIndex(
                schemaVersion: 1,
                generatedAt: "",
                source: CatalogSource(deviceType: "desktop", contentType: "dynamic", categoryName: nil, categoryIds: []),
                categories: [
                    LivewallCategoryEntry(id: 1, name: "甲", file: "category.1.json", itemCount: 1, sha256: nil),
                    LivewallCategoryEntry(id: 2, name: "乙", file: "category.2.json", itemCount: 1, sha256: nil),
                ]
            )
            let problem = CatalogSignature.digestProblem(in: index) ?? ""
            expect(problem.contains("甲") && problem.contains("乙"), "两个都要报出来，实际：\(problem)")
        }
    }

    // MARK: - 地址推导

    suite("内容清单：签名文件地址推导") {

        test("与线上实际地址形状一致") {
            expectEqual(
                CatalogSignature.documentURL(for: URL(string: "https://studio.meowv.com/data/livewall/catalog.json")!)?.absoluteString,
                "https://studio.meowv.com/data/livewall/catalog.json.sig",
                "线上真实地址"
            )
        }

        test("目录地址推不出来 —— 宁可判不可用，也不猜一个地址") {
            expectNil(CatalogSignature.documentURL(for: URL(string: "https://a.b/livewall/")!), "以 / 结尾")
            expectNil(CatalogSignature.documentURL(for: URL(string: "https://a.b")!), "没有路径")
        }
    }

    // MARK: - 固定向量（真实发布私钥签出）

    suite("内容清单：签名固定向量") {

        /// 六个向量（载荷字节数, 名称, 载荷, 签名）。字节数是**绊线**：
        /// 有人手抖改了字面量里的一个字符时，先在这里报「长度变了」，
        /// 而不是让 verify 报「签名不符」把人引到密钥或密码学上去。
        let vectors: [(Int, String, String, String)] = [
            (378, "正常（远程）", SignedIndex.remotePayload, SignedIndex.remoteSignature),
            (378, "正常（副本）", SignedIndex.cachePayload, SignedIndex.cacheSignature),
            (378, "正常（副本二）", SignedIndex.cacheAltPayload, SignedIndex.cacheAltSignature),
            (252, "负例：空分类", SignedIndex.emptyCategoriesPayload, SignedIndex.emptyCategoriesSignature),
            (320, "负例：缺摘要", SignedIndex.missingDigestPayload, SignedIndex.missingDigestSignature),
            (15, "负例：非 JSON", SignedIndex.badJSONPayload, SignedIndex.badJSONSignature),
        ]

        test("六个向量都能被内嵌公钥验过（绊线）") {
            // ⚠️ 这条红了，第一嫌疑是 `UpdateSignature.publicKeyBase64` 被换过，
            //    而不是密码学出了问题 —— 与 `UpdateSignatureTests` 里那条同源。
            for (byteCount, name, payload, signature) in vectors {
                expectEqual(Data(payload.utf8).count, byteCount, "\(name) 的载荷字节数")
                expectEqual(Data(base64Encoded: signature)?.count, 64, "\(name) 的签名应是 64 字节")
                expectEqual(
                    CatalogSignature.verify(payload: Data(payload.utf8), document: signatureDocument(signature)),
                    .trusted,
                    "\(name) 应验签通过"
                )
            }
        }

        test("负例向量是**真的**签过名的 —— 失败必须发生在后面的解析/校验那一步") {
            // 少了这条，一个「负例其实没签名、所以反正也没用上解析路径」的实现也能全绿。
            // 这里刻意只断言验签通过，不断言它们「内容合规」—— 它们本来就不合规。
            for (_, name, payload, signature) in vectors where name.hasPrefix("负例") {
                expectEqual(
                    CatalogSignature.verify(payload: Data(payload.utf8), document: signatureDocument(signature)),
                    .trusted,
                    "\(name) 的签名本身是有效的"
                )
            }
        }

        test("载荷改一个字节 → 验签不再通过") {
            let tampered = SignedIndex.remotePayload.replacingOccurrences(of: "\"id\":7", with: "\"id\":8")
            expect(tampered != SignedIndex.remotePayload, "前提：替换确实改了内容")
            let outcome = CatalogSignature.verify(
                payload: Data(tampered.utf8),
                document: signatureDocument(SignedIndex.remoteSignature)
            )
            expect(!outcome.isTrusted, "改过的载荷不能用")
            // 只断言原因里含「不符」，不锁整句文案：那句话同时被更新链复用（用户可见），
            // 会随文案调整而变，锁死它只会让改文案的人被迫来改测试。
            if case .rejected(let reason) = outcome {
                expect(reason.contains("不符"), "原因要指出签名不符，实际「\(reason)」")
            } else {
                expect(false, "期望判为拒绝，实际 \(outcome)")
            }
        }

        test("签名文件缺失/为空 → 拒绝（没有「没签名就按旧的来」这条路）") {
            for document in [Data(), Data("{}".utf8), Data("not json".utf8)] {
                expect(
                    !CatalogSignature.verify(payload: Data(SignedIndex.remotePayload.utf8), document: document).isTrusted,
                    "空/残缺的签名文件不能放行：\(String(decoding: document, as: UTF8.self))"
                )
            }
        }
    }
}

/// 拼一份签名文件。形状与 `tools/sign-version.swift` 写出的一致。
///
/// 与 `UpdateSignatureTests` 里那个同名函数各占一份（那边默认注入的是更新清单的向量）——
/// 刻意复制而不是共用：共用会让两边任一处改动都悄悄影响另一边的语义。
private func signatureDocument(_ signature: String) -> Data {
    Data(#"{"alg":"ed25519","signature":"\#(signature)"}"#.utf8)
}
