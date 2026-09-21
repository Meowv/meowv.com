import CryptoKit
import Foundation

/// 更新信息的**独立密钥签名**（Ed25519）—— 更新链上最后一道闸。
///
/// 它同时是**内容清单签名**的基座：`catalog.json` 走的也是这一套（密钥、签名文件格式、
/// 信任锚、失败语义全部共用，见 `CatalogSignature`）。两条链共用一个实现是刻意的 ——
/// 各自实现一遍验签，两边的严格程度迟早会分叉，而分叉的方向通常是「其中一边松了」。
///
/// ## 为什么有了 `sha256` 还要签名
///
/// `sha256` 字段本身写在 `version.json` 里。能改 `version.json` 的人（静态站被入侵、
/// 发布脚本被改、CDN 缓存被投毒、DNS/TLS 被绕过）就能把摘要和下载地址**一起**换掉 ——
/// 摘要只证明「下载到的文件与清单一致」，证明不了「清单是作者发的」。
///
/// 签名补上的正是后者：**私钥只在本机离线保存，公钥写死在客户端里**。
/// 服务端被入侵时攻击者拿不到私钥，改过的 `version.json` 过不了验签。
///
/// ## 签的到底是什么
///
/// **`version.json` 的原始字节**，一个字节都不重排。
///
/// 刻意不做「解析出字段再拼成规范串」那种规范化：那等于要求签名端与验签端实现同一套
/// 序列化规则，两边一旦有差异就会出现「作者签得出、客户端验不过」，更糟的是
/// 「攻击者能构造出同一规范串」。原始字节是唯一没有歧义的输入。
///
/// 代价是**发布时必须原样上传**：重新格式化 JSON（换缩进、调键顺序、加尾随换行）
/// 会让签名失效。这是刻意的取舍 —— 宁可发布流程严格，不要验签语义有缝。
/// 发布前用 `tools/sign-version.swift verify` 对**已上传的那份文件**再验一次即可确认。
///
/// ## 为什么签名不写在 `version.json` 里
///
/// 签名要覆盖这个文件的原始字节，而签名本身又在这个文件里 —— 自我指涉，无解。
/// 所以签名另起一个文件（`version.json.sig`），地址由 `documentURL(for:)` 推导。
///
/// ## 验不过就是不可用
///
/// **没有「验不过就退回只看 sha256」这条路。** 那种降级等于没做：攻击者把签名文件
/// 删掉即可绕过。缺签名文件、签名格式不对、签名不匹配，一律判整份版本信息不可用 ——
/// 与 `sha256` 必填同一条理由：宁可这次不提示更新，也不认一份来源不明的清单。
///
/// 密钥与签名由 `tools/sign-version.swift` 在本机离线生成 / 使用，私钥**不在仓库里**。
public enum UpdateSignature {

    /// 验签结论。**只有两态**。
    ///
    /// 与 `Seal.Outcome` 刻意不同（那里有 `.undetermined`）：自校验要面对 ad-hoc 签名
    /// 没有证书锚点这种「判不了」的情形，而这里的输入完全自足 ——
    /// 原始字节 + 签名文件 + 内嵌公钥，要么成立要么不成立，没有第三种。
    public enum Outcome: Equatable, Sendable {
        /// 签名有效，且确实由内嵌公钥对应的私钥签发。
        case trusted
        /// 签名无效或缺失。附原因，用于日志与手动检查的回执。
        case rejected(String)

        /// 便于调用方分支与测试断言。
        public var isTrusted: Bool { self == .trusted }
    }

    /// 签名算法标识。写进签名文件的 `alg` 字段并被**严格校验**。
    ///
    /// 这样将来换算法时旧客户端会明确拒绝新格式，而不是拿它当别的什么去解 ——
    /// 一条防「算法降级」的窄缝，代价只是一个字段。
    public static let algorithm = "ed25519"

    /// 签名文件的字段名。`tools/sign-version.swift` 写出的必须是这两个。
    public static let algorithmField = "alg"
    public static let signatureField = "signature"

    /// 签名文件相对版本信息的后缀（`version.json` → `version.json.sig`）。
    public static let documentExtension = "sig"

    /// Ed25519 签名的固定长度。长度不对直接拒，不送去验签。
    public static let signatureLength = 64

    /// 内嵌的验签公钥（Ed25519 32 字节原始值的 base64）。
    ///
    /// **换密钥 = 必须重新发版。** 这个常量是客户端里唯一的信任锚，改了它旧版本客户端
    /// 就再也验不过新签名；反之旧公钥也验不过新私钥签出的东西。轮换时两者必须一起走
    /// （用 `tools/sign-version.swift keygen` 会打印可直接替换的一行）。
    ///
    /// 公钥**刻意不做混淆**（不像 `PackedText.swift` 里的服务端地址）：它不是秘密，
    /// 混淆只会让审计变难；而想换掉它的人本来就能改二进制（ad-hoc 签名没有锚点，见 `Seal`）。
    public static let publicKeyBase64 = "uw8Vk66JTibIFtfw1kanLL75Ir5Y3P6+GPmzyYkzxmQ="

    /// 内嵌公钥的解析结果。写死在源码里，正常情况下**不可能**是 nil。
    ///
    /// 真为 nil（源码被改坏、base64 被截断）时**必须拒绝而不是放行** ——
    /// 与「`sha256` 解析不出来就整体判不可用」同一条原则：信任锚坏了，
    /// 唯一安全的动作是停止信任，而不是跳过校验。
    public static var publicKey: Curve25519.Signing.PublicKey? {
        guard let raw = Data(base64Encoded: publicKeyBase64), raw.count == 32 else { return nil }
        return try? Curve25519.Signing.PublicKey(rawRepresentation: raw)
    }

    // MARK: - 验签

    /// 用**内嵌公钥**验签。`payload` 是 `version.json` 的原始字节，`document` 是签名文件的内容。
    ///
    /// 顺序即优先级：先确认信任锚可用，再解析签名文件，最后才做密码学验证。
    /// 每一步失败都给出可区分的原因 —— 手动点「检查更新」时这些字符串会直接显示给用户，
    /// 「签名不匹配」和「签名文件没上传」是两种完全不同的排障方向。
    public static func verify(payload: Data, document: Data) -> Outcome {
        guard let key = publicKey else {
            return .rejected("内嵌公钥不可用（构建异常，请重新安装）")
        }

        let object: [String: Any]
        do {
            guard let dict = try JSONSerialization.jsonObject(with: document) as? [String: Any] else {
                return .rejected("签名文件根节点不是 JSON 对象")
            }
            object = dict
        } catch {
            // 最典型的情形：签名文件 404，静态站把 index.html 兜底返回了，
            // 于是这里拿到一段 HTML。原因必须说清楚，否则会被误读成「签名错了」。
            return .rejected("签名文件不是 JSON（是不是没上传 .\(documentExtension) 文件？）")
        }

        let algorithm = (object[algorithmField] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard algorithm == Self.algorithm else {
            return .rejected("签名算法不受支持（需要 \(Self.algorithm)）")
        }

        guard let encoded = (object[signatureField] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !encoded.isEmpty else {
            return .rejected("签名文件缺少 \(signatureField) 字段")
        }

        // `.ignoreUnknownCharacters` 是为了容忍 base64 被换行折断 ——
        // 那是很常见的书写意外，而它不影响解码出的字节。真正的把关在下面的长度检查：
        // 掺了垃圾字符只会让解码结果变短，逃不过 64 字节这一关。
        guard let signature = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters) else {
            return .rejected("签名不是合法的 base64")
        }
        guard signature.count == signatureLength else {
            return .rejected("签名长度应为 \(signatureLength) 字节，实际 \(signature.count) 字节")
        }

        guard key.isValidSignature(signature, for: payload) else {
            return .rejected("签名与版本信息不符")
        }
        return .trusted
    }

    // MARK: - 地址推导

    /// 由**被签文件**的地址推出签名文件的地址（`…/version.json` → `…/version.json.sig`，
    /// `…/catalog.json` → `…/catalog.json.sig`）。
    ///
    /// 路径为空或以 `/` 结尾（即给的是一个目录）时推不出来，返回 nil ——
    /// 调用方据此判不可用。**不猜**一个「大概是这样」的地址：
    /// 猜错的表现是「拉到一个不存在的位置」，比直接说「地址不像文件」更难排障。
    ///
    /// 查询串与片段会原样保留（`version.json?v=2` → `version.json.sig?v=2`）。
    public static func documentURL(for sourceURL: URL) -> URL? {
        guard let components = URLComponents(url: sourceURL, resolvingAgainstBaseURL: false) else {
            return nil
        }
        guard !components.path.isEmpty, !components.path.hasSuffix("/") else { return nil }
        return sourceURL.appendingPathExtension(documentExtension)
    }
}
