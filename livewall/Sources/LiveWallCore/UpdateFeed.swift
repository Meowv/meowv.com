import Foundation

/// 远程版本信息（`version.json`）—— 只描述「线上有哪一版」，不含任何下载或安装动作。
///
/// **这是远端数据**，解析必须防御式：任何必填字段缺失或类型不对，整体判为不可用并把原因
/// 记进 `warnings`，**不猜、不部分采用**。理由与 `CatalogCoding.sanitize` 一致 ——
/// 半截的版本信息会让用户看到一个「版本 0.2.0、但没有下载地址」的更新提示，比不提示更糟。
public struct UpdateFeed: Equatable, Sendable {

    /// 展示用的版本号（`0.2.0`）。**只用于显示，不参与比较** ——
    /// 语义化版本比较会踩 `0.10.0 < 0.9.0` 这类坑，比较一律走 `build`。
    public var version: String
    /// 比对的权威值（`CFBundleVersion`）。必须为正整数，发版时必须递增。
    public var build: Int
    /// 更新说明。缺失视为空串。
    public var notes: String
    /// dmg 体积。可选 —— 拿不到就在菜单里不显示这一行，不影响提示本身。
    public var sizeBytes: Int64?
    /// dmg 的 SHA-256（64 位十六进制）。**必填** —— 缺失或格式非法整体判不可用，
    /// 见 `UpdateFeedCoding.decode`。
    ///
    /// 为什么必填：更新包没有校验值，等于「服务端说装什么就装什么」，与「`fileURL` 必须 https」
    /// 是同一条理由 —— 把「装什么」的决定权交出去。宁可这次不提示更新，也不给一个无法校验的
    /// 下载入口。
    public var sha256: String
    /// dmg 下载地址。解析成功时**必然是 https**（http 一律拒绝）。
    public var fileURL: URL
    /// 最低系统版本（`13.0`）。可选；给了就与当前系统比对。
    public var minOSVersion: String?

    public init(
        version: String,
        build: Int,
        notes: String = "",
        sizeBytes: Int64? = nil,
        sha256: String,
        fileURL: URL,
        minOSVersion: String? = nil
    ) {
        self.version = version
        self.build = build
        self.notes = notes
        self.sizeBytes = sizeBytes
        self.sha256 = sha256
        self.fileURL = fileURL
        self.minOSVersion = minOSVersion
    }

    /// 与实际下载到的文件比对 SHA-256。忽略大小写与首尾空白 ——
    /// 手写的 `version.json` 里带空格或大写是很常见的。
    ///
    /// 期望值**一定有值**（`sha256` 是必填字段），所以这里刻意没有「没给就放行」的分支：
    /// 那种写法会让「服务端漏填」悄悄降级成「不做校验」，正是要避免的。
    public func sha256Matches(_ actual: String) -> Bool {
        let expected = sha256.trimmingCharacters(in: .whitespacesAndNewlines)
        return expected.caseInsensitiveCompare(actual.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
    }

    /// 建议的落盘文件名。带版本号，避免多次更新后互相覆盖、
    /// 也避免名字里出现版本之外的东西让人分不清下的是哪一版。
    ///
    /// ⚠️ `version` 是**远端字段**，必须清洗后再拼进文件名：`appendingPathComponent`
    /// 不会解析 `..`，所以 `"version": "../../../../tmp/x"` 会写到下载目录之外。
    /// 实际风险很低（`version.json` 有 Ed25519 签名，只有持私钥的人能构造），
    /// 但「签名保护的是来源，不保护字段语义」这条缝不值得留着 ——
    /// 何况 `DownloadNaming.sanitize` 已经在同一个仓库里解决过完全相同的问题。
    ///
    /// 清洗后可能为空（版本号全是非法字符）：那时退回 `build` 号，
    /// 绝不用空串拼出一个以 `-` 结尾的怪名字。
    public var suggestedFileName: String {
        let cleaned = DownloadNaming.sanitize(version)
        return "LiveWall-\(cleaned.isEmpty ? String(build) : cleaned).dmg"
    }
}

public enum UpdateFeedCoding {

    /// 解析远程版本信息。失败返回 nil，原因进 `warnings`（调用方负责记日志）。
    ///
    /// 用 `JSONSerialization` 而不是合成的 `Codable`：远端 JSON 的 `build` 可能是
    /// 数字也可能是字符串数字，Codable 遇到类型不符会直接抛、整个文件解不出来 ——
    /// 那是**服务端的书写习惯**问题，不该让用户为此看不到更新提示。
    public static func decode(_ data: Data, into warnings: inout [String]) -> UpdateFeed? {
        let object: [String: Any]
        do {
            let any = try JSONSerialization.jsonObject(with: data)
            guard let dict = any as? [String: Any] else {
                warnings.append("版本信息解析失败：根节点不是 JSON 对象")
                return nil
            }
            object = dict
        } catch {
            warnings.append("版本信息解析失败：\(error.localizedDescription)")
            return nil
        }

        guard let rawVersion = object["version"] as? String,
              !rawVersion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            warnings.append("版本信息不可用：version 缺失或不是非空字符串")
            return nil
        }

        guard let build = positiveInt(object["build"]) else {
            warnings.append("版本信息不可用：build 缺失或不是正整数")
            return nil
        }

        guard let rawURL = object["fileURL"] as? String,
              let url = URL(string: rawURL),
              url.scheme?.lowercased() == "https" else {
            // 与 `Preferences.resolvedRemoteURL` 同一条规则：只认 https。
            // 更新包走 http 等于把「装什么」这件事交给中间人。
            warnings.append("版本信息不可用：fileURL 缺失或不是 https")
            return nil
        }

        // sha256 是**必填**，且必须是 64 位十六进制 —— 与 version / build / fileURL 同级。
        // 服务端漏填时宁可这次不提示更新（原因进 warnings），也不放行一个无法校验的下载。
        guard let sha256 = trimmedNonEmpty(object["sha256"] as? String), isValidSHA256(sha256) else {
            warnings.append("版本信息不可用：sha256 缺失或不是 64 位十六进制")
            return nil
        }

        let notes = (object["notes"] as? String) ?? ""
        let sizeBytes = positiveInt(object["sizeBytes"]).map { Int64($0) }
        let minOSVersion = trimmedNonEmpty(object["minOSVersion"] as? String)

        return UpdateFeed(
            version: rawVersion.trimmingCharacters(in: .whitespacesAndNewlines),
            build: build,
            notes: notes,
            sizeBytes: sizeBytes,
            sha256: sha256,
            fileURL: url,
            minOSVersion: minOSVersion
        )
    }

    /// **验签 + 解析**的组合入口：先验签，通过才解析。
    ///
    /// 单独开一个入口而不是让调用方自己拼两步，是为了把**顺序**钉在这里并让它可单测 ——
    /// 签名不过的清单是不可信数据，不该进解析、更不该参与更新判定。
    /// 顺序反了**不会报错**，只会静默失去防护（解析器本身是防御式的，拿到伪造清单
    /// 照样能解析成功），所以这个顺序值得一个专门的入口和一条断言。
    ///
    /// 验签不过返回 nil 并附原因，**没有「退回只看 sha256」这条路**（见 `UpdateSignature`）。
    public static func decodeVerified(
        payload: Data,
        signatureDocument: Data,
        into warnings: inout [String]
    ) -> UpdateFeed? {
        switch UpdateSignature.verify(payload: payload, document: signatureDocument) {
        case .trusted:
            return decode(payload, into: &warnings)
        case .rejected(let reason):
            warnings.append("更新信息签名校验失败：\(reason)")
            return nil
        }
    }

    /// 取正整数。`Int` / 整的数字 / 数字字符串都接受，其它一律 nil。
    ///
    /// 小数（2.5）判为非法而不是截断 —— 一个不确定的 build 号比没有更危险：
    /// 它会让「有没有新版本」这个判断变得无法复现。
    private static func positiveInt(_ value: Any?) -> Int? {
        if let int = value as? Int { return int > 0 ? int : nil }
        if let number = value as? NSNumber {
            let double = number.doubleValue
            guard double > 0, double <= Double(Int.max), double.rounded() == double else { return nil }
            return Int(double)
        }
        if let string = value as? String, let int = Int(string), int > 0 { return int }
        return nil
    }

    /// 是否是 64 位十六进制（SHA-256 的固定长度）。
    ///
    /// 长度不对的摘要**永远不可能**匹配 —— 放行它只会让用户白下载几十 MB 之后才收到
    /// 「校验不符」。与 `build` 拒绝小数是同一条理由：确定不可能成立的输入，
    /// 不该留到运行时才发现。
    private static func isValidSHA256(_ value: String) -> Bool {
        value.count == 64 && value.allSatisfy { $0.isHexDigit }
    }

    private static func trimmedNonEmpty(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }
        return value
    }
}
