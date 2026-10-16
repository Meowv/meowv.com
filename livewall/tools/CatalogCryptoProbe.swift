import Foundation
import LiveWallCore

// 定向跨语言测试入口：参数中的密钥与载荷均由测试在临时目录合成。
@main
struct CatalogCryptoProbe {
    static func main() throws {
        let args = CommandLine.arguments
        let keyText = try String(contentsOfFile: args[1], encoding: .utf8)
        let key = CatalogKeyMaterial(masterKey: Data(base64Encoded: keyText.trimmingCharacters(in: .whitespacesAndNewlines))!)
        let payload = try Data(contentsOf: URL(fileURLWithPath: args[2]))
        if args.count > 4 {
            do {
                _ = try CatalogCrypto.decrypt(payload, context: "all", using: key)
                exit(1)
            } catch { return }
        }
        _ = try CatalogCoding.decode(CatalogCrypto.decrypt(payload, context: "all", using: key))
        for context in ["category:1", "index-cache"] {
            do {
                _ = try CatalogCrypto.decrypt(payload, context: context, using: key)
                exit(1)
            } catch { }
        }
        let wrongKey = CatalogKeyMaterial(masterKey: Data(repeating: 0x42, count: 32))
        do {
            _ = try CatalogCrypto.decrypt(payload, context: "all", using: wrongKey)
            exit(1)
        } catch { }
        var tampered = payload
        tampered[tampered.count - 1] ^= 1
        do {
            _ = try CatalogCrypto.decrypt(tampered, context: "all", using: key)
            exit(1)
        } catch { }
        try CatalogCrypto.encrypt(Data("swift-cache".utf8), context: "index-cache", using: key)
            .write(to: URL(fileURLWithPath: args[3]))
    }
}
