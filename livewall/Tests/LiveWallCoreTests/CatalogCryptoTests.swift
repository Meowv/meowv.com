import Foundation
import LiveWallCore

func catalogCryptoTests() {
    suite("LiveWall 清单加密") {
        test("密钥标识稳定且只暴露短摘要") {
            let key = Data(repeating: 0x41, count: CatalogCrypto.masterKeyBytes)
            let material = CatalogKeyMaterial(masterKey: key)
            expectEqual(material.keyID, "22a48051594c1949", "密钥标识")
            expectEqual(material.keyID.count, 16, "密钥标识长度")
        }

        test("Node AES-GCM + gzip 固定向量可解密") {
            let key = Data(repeating: 0x41, count: CatalogCrypto.masterKeyBytes)
            let material = CatalogKeyMaterial(masterKey: key)
            let payload = Data(
                base64Encoded:
                    "TFdDQgECAgICAgICAgICAgJRY2Vq0PPx80MdYh0Z7khlKKcCApvxuC4JECHudTG1v8Jpm+S7j4/NDkKu0Y0BvNc="
            )!
            do {
                let plain = try CatalogCrypto.decrypt(payload, context: "category:1", using: material)
                expectEqual(String(data: plain, encoding: .utf8), "{\"ok\":true}\n", "解密内容")
            } catch {
                expect(false, "固定向量解密失败：\(error)")
            }
        }

        test("错误密钥和截断数据都拒绝") {
            let payload = Data(
                base64Encoded:
                    "TFdDQgECAgICAgICAgICAgJRY2Vq0PPx80MdYh0Z7khlKKcCApvxuC4JECHudTG1v8Jpm+S7j4/NDkKu0Y0BvNc="
            )!
            expectThrows("错误密钥应拒绝") {
                _ = try CatalogCrypto.decrypt(
                    payload,
                    context: "category:1",
                    using: CatalogKeyMaterial(masterKey: Data(repeating: 0x42, count: 32))
                )
            }
            expectThrows("截断数据应拒绝") {
                _ = try CatalogCrypto.decrypt(
                    payload.dropLast(3),
                    context: "category:1",
                    using: CatalogKeyMaterial(masterKey: Data(repeating: 0x41, count: 32))
                )
            }
        }
        test("生产入口的 v2 索引、密文切片、离线缓存与换钥拒绝") {
            // 合成内容由当前信任锚签名；密钥是公开的测试字节，不使用发布加密密钥。
            let indexData = Data(#"{"schemaVersion":2,"generatedAt":"fixture","source":{"deviceType":"desktop","contentType":"dynamic"},"categories":[{"id":1,"name":"fixture","file":"category.1.bin","itemCount":1,"sha256":"bbaecbb183f8e1a15f7edfef23a1fc488231324c028f33896d06b16d74adc22c"}],"encryption":"aes-256-gcm","encryptionVersion":1,"compression":"gzip","keyID":"22a48051594c1949"}"#.utf8)
            let signatureData = Data(#"{"alg":"ed25519","signature":"ekfreTz6bxtV7NZ10hx3jSm4JSJ/r26SOc/+5DVI1h5WRsLSwlE2GLqNnK1E+5Q31vBo7KsV6nwIPFLaVuoLDg=="}"#.utf8)
            let payload = Data(base64Encoded: "TFdDQgECAgICAgICAgICAgLDykq5fJZITjva49Bf1VD4KKcCApvxuC4JEOc1AvQhPfAFbkzYyygtEs4ATt2l/58OSYSRSwsHVZQqKiIutsU0meCDxu79y6XcYaK93iVOrMcIjadcuzuxwdWadRUb+o9moMpcE2kiCPjlYG2GkDoqZOZVni/8QMe1KBz5PU8PW58CXAQb6xAYxVSH89LA1fG8g0f0F5kGCRMXUvFhKTBEKAVVDtIQwyZTu4YXoL+qOGNKQ5O00CK+VbLLN+1TTQ==")!
            let material = CatalogKeyMaterial(masterKey: Data(repeating: 0x41, count: 32))
            func service(_ key: CatalogKeyMaterial? = material) -> CatalogService {
                CatalogService(remoteIndexURL: URL(string: testIndexURL),
                               indexCacheURL: URL(fileURLWithPath: testIndexCachePath),
                               sliceCacheURL: URL(fileURLWithPath: testSliceCachePath), catalogKey: key)
            }
            let transport = FakeTransport()
            transport.remote[testIndexURL] = indexData
            transport.remote[testIndexSignatureURL] = signatureData
            transport.remote["https://cdn.test/livewall/category.1.bin"] = payload
            guard let index = service().loadIndex(transport: transport).index,
                  let entry = index.categories.first else {
                expect(false, "v2 索引应加载成功")
                return
            }
            let remote = service().loadSlice(entry, transport: transport)
            expectEqual(remote.origin, .remote, "生产解密入口")
            expectEqual(remote.catalog?.items.first?.id, 1, "解密条目")
            expectEqual(remote.cacheData, payload, "返回密文供缓存")
            do { try service().cacheSlice(payload, transport: transport) }
            catch { expect(false, "写密文失败：\(error)") }
            expect(transport.files[testIndexCachePath] != indexData, "索引缓存不能是 JSON")
            expectEqual(transport.files[testSliceCachePath], payload, "切片缓存原样保存密文")
            transport.remoteError = StubError(message: "离线")
            expectEqual(service().loadIndex(transport: transport).origin, .cachedRemote, "离线恢复索引")
            expectEqual(service().loadSlice(entry, transport: transport).origin, .cachedRemote, "离线恢复切片")
            let wrong = CatalogKeyMaterial(masterKey: Data(repeating: 0x42, count: 32))
            expectNil(service(wrong).loadIndex(transport: transport).index, "新版 App 拒绝旧缓存")
            expectNil(service(wrong).loadSlice(entry, transport: transport).catalog, "换钥不能读取旧切片")
            transport.remoteError = nil
            expectNil(service(wrong).loadIndex(transport: transport).index, "在线旧索引 keyID 不匹配同样拒绝")
            expectNil(service(nil).loadIndex(transport: transport).index, "缺内嵌密钥拒绝使用")
            transport.files[testIndexCachePath] = indexData
            transport.remoteError = StubError(message: "离线")
            expectNil(service().loadIndex(transport: transport).index, "明文旧缓存不能回退使用")
        }
        test("本地索引加密往返、篡改、上下文和解压限制") {
            let material = CatalogKeyMaterial(masterKey: Data(repeating: 0x41, count: 32))
            do {
                let plain = Data("{\"categories\":[]}".utf8)
                let payload = try CatalogCrypto.encrypt(plain, context: "index-cache", using: material)
                expectEqual(try CatalogCrypto.decrypt(payload, context: "index-cache", using: material), plain, "缓存往返")
                var tampered = payload
                tampered[tampered.count - 1] ^= 1
                expectThrows("篡改应拒绝") {
                    _ = try CatalogCrypto.decrypt(tampered, context: "index-cache", using: material)
                }
                expectThrows("切片不能冒充索引") {
                    _ = try CatalogCrypto.decrypt(payload, context: "all", using: material)
                }
                expectThrows("编码大小限制") {
                    _ = try CatalogCrypto.encrypt(Data(count: CatalogCrypto.maxDecompressedBytes + 1), context: "all", using: material)
                }
                let empty = try CatalogCrypto.encrypt(Data(), context: "index-cache", using: material)
                expectEqual(try CatalogCrypto.decrypt(empty, context: "index-cache", using: material), Data(), "空内容")
            } catch {
                expect(false, "缓存加解密失败：\(error)")
            }
        }
    }
}
