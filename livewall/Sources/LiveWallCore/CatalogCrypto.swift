import zlib
import CryptoKit
import Foundation

public struct CatalogKeyMaterial: Sendable {
    public let keyID: String
    public let masterKey: Data

    public init(masterKey: Data) {
        self.masterKey = masterKey
        self.keyID = CatalogCrypto.keyID(for: masterKey)
    }
}

/// 加密清单密钥从 App Resources 注入，源码与仓库不保存发布密钥。
public enum CatalogReleaseKey {
    public static let resourceName = "livewall-catalog-key"

    public static func load(from bundle: Bundle = .main) -> CatalogKeyMaterial? {
        guard let url = bundle.url(forResource: resourceName, withExtension: "txt"),
              let data = try? Data(contentsOf: url),
              let text = String(data: data, encoding: .utf8),
              let key = Data(base64Encoded: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              key.count == CatalogCrypto.masterKeyBytes
        else {
            return nil
        }
        return CatalogKeyMaterial(masterKey: key)
    }
}

public enum CatalogCryptoError: Error, LocalizedError {
    case malformed
    case unsupportedVersion(Int)
    case authenticationFailed
    case decompressionFailed
    case decompressedDataTooLarge

    public var errorDescription: String? {
        switch self {
        case .malformed: return "加密清单格式无效"
        case .unsupportedVersion(let version): return "加密清单版本不匹配：\(version)"
        case .authenticationFailed: return "加密清单认证失败"
        case .decompressionFailed: return "加密清单解压失败"
        case .decompressedDataTooLarge: return "加密清单解压后超过大小限制"
        }
    }
}

public enum CatalogCrypto {
    public static let masterKeyBytes = 32
    public static let magic = Data("LWCB".utf8)
    public static let version = 1
    public static let maxDecompressedBytes = 16 * 1024 * 1024

    public static func keyID(for masterKey: Data) -> String {
        String(ContentDigest.sha256Hex(masterKey).prefix(16)).lowercased()
    }

    public static func decrypt(
        _ payload: Data,
        context: String,
        using material: CatalogKeyMaterial
    ) throws -> Data {
        guard material.masterKey.count == masterKeyBytes else { throw CatalogCryptoError.malformed }
        let headerSize = magic.count + 1 + 12 + 16
        guard payload.count > headerSize,
              payload.prefix(magic.count) == magic
        else { throw CatalogCryptoError.malformed }
        guard payload[magic.count] == version else {
            throw CatalogCryptoError.unsupportedVersion(Int(payload[magic.count]))
        }

        let ivStart = magic.count + 1
        let tagStart = ivStart + 12
        let ciphertextStart = tagStart + 16
        let iv = payload[ivStart..<tagStart]
        let tag = payload[tagStart..<ciphertextStart]
        let ciphertext = payload[ciphertextStart..<payload.count]
        let derived = SHA256.hash(data: material.masterKey + magic + Data([UInt8(version)]) + Data(context.utf8))

        do {
            let key = SymmetricKey(data: derived)
            let nonce = try AES.GCM.Nonce(data: iv)
            let box = try AES.GCM.SealedBox(
                nonce: nonce,
                ciphertext: ciphertext,
                tag: tag
            )
            let compressed = try AES.GCM.open(box, using: key)
            return try decompress(compressed)
        } catch let error as CatalogCryptoError {
            throw error
        } catch {
            throw CatalogCryptoError.authenticationFailed
        }
    }

    public static func encrypt(
        _ plaintext: Data,
        context: String,
        using material: CatalogKeyMaterial
    ) throws -> Data {
        guard material.masterKey.count == masterKeyBytes else { throw CatalogCryptoError.malformed }
        let iv = Data((0..<12).map { _ in UInt8.random(in: 0...255) })
        let derived = SHA256.hash(data: material.masterKey + magic + Data([UInt8(version)]) + Data(context.utf8))
        let key = SymmetricKey(data: derived)
        let compressed = try gzip(plaintext)
        let sealed = try AES.GCM.seal(compressed, using: key, nonce: AES.GCM.Nonce(data: iv))
        return magic
            + Data([UInt8(version)])
            + iv
            + sealed.tag
            + sealed.ciphertext
    }

    private static func gzip(_ data: Data) throws -> Data {
        guard data.count <= maxDecompressedBytes else { throw CatalogCryptoError.decompressedDataTooLarge }
        var stream = z_stream()
        guard deflateInit2_(&stream, Z_DEFAULT_COMPRESSION, Z_DEFLATED, 15 + 16, 8,
                            Z_DEFAULT_STRATEGY, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)) == Z_OK
        else { throw CatalogCryptoError.decompressionFailed }
        defer { deflateEnd(&stream) }
        let capacity = Int(deflateBound(&stream, uLong(data.count)))
        var output = Data(count: capacity)
        let status = output.withUnsafeMutableBytes { destination in
            data.withUnsafeBytes { source in
                stream.next_in = UnsafeMutablePointer(mutating: source.bindMemory(to: Bytef.self).baseAddress)
                stream.avail_in = uInt(data.count)
                stream.next_out = destination.bindMemory(to: Bytef.self).baseAddress
                stream.avail_out = uInt(capacity)
                return deflate(&stream, Z_FINISH)
            }
        }
        guard status == Z_STREAM_END else { throw CatalogCryptoError.decompressionFailed }
        output.count = Int(stream.total_out)
        return output
    }

    private static func decompress(_ data: Data) throws -> Data {
        var stream = z_stream()
        // gzip 模式由系统 zlib 校验头、CRC、原始长度和流结束；拒绝截断和尾随数据。
        guard inflateInit2_(&stream, 15 + 16, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)) == Z_OK
        else { throw CatalogCryptoError.decompressionFailed }
        defer { inflateEnd(&stream) }
        var output = Data()
        try data.withUnsafeBytes { source in
            stream.next_in = UnsafeMutablePointer(mutating: source.bindMemory(to: Bytef.self).baseAddress)
            stream.avail_in = uInt(data.count)
            var chunk = [UInt8](repeating: 0, count: 64 * 1024)
            while true {
                let status = chunk.withUnsafeMutableBytes { destination in
                    stream.next_out = destination.bindMemory(to: Bytef.self).baseAddress
                    stream.avail_out = uInt(destination.count)
                    return inflate(&stream, Z_NO_FLUSH)
                }
                let count = chunk.count - Int(stream.avail_out)
                guard output.count + count <= maxDecompressedBytes else {
                    throw CatalogCryptoError.decompressedDataTooLarge
                }
                output.append(contentsOf: chunk.prefix(count))
                if status == Z_STREAM_END {
                    guard stream.avail_in == 0 else { throw CatalogCryptoError.decompressionFailed }
                    return
                }
                guard status == Z_OK, count > 0 else { throw CatalogCryptoError.decompressionFailed }
            }
        }
        return output
    }
}

public enum CatalogCryptoEncryption {
    public static let name = "aes-256-gcm"
    public static let version = 1
    public static let compression = "gzip"
}
