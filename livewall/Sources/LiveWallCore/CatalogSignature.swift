import CryptoKit
import Foundation

/// 内容摘要（sha256，十六进制）。
///
/// 与更新链的 `sha256` 字段同一口径：**算的是收到的原始字节**，不是「解析出来的对象」。
/// 生成侧（`wallpapers/src/wallpapers/export.py`）也是先把 JSON 编成 bytes、写盘与算摘要
/// 共用同一个 bytes 对象 —— 两边任何一处改成「写盘前再编码一次」都会让校验必然失败。
public enum ContentDigest {

    /// sha256 十六进制串的长度（32 字节 → 64 个字符）。
    public static let hexLength = 64

    private static let hexDigits = Set("0123456789abcdefABCDEF")

    /// 字节的 sha256（小写十六进制）。
    public static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// 是不是一个合法的摘要串。
    ///
    /// 大小写**不敏感**地接受：生成侧统一写小写，但摘要被手抄到别处再贴回来很容易变成大写，
    /// 为此判失败不值得。长度与字符集必须严格 —— 那才是「摘要」与「随便一个字符串」的区别。
    public static func isValid(_ hex: String?) -> Bool {
        guard let hex, hex.count == hexLength else { return false }
        return hex.allSatisfy { hexDigits.contains($0) }
    }

    /// `data` 的摘要是否等于 `hex`。
    ///
    /// `hex` 不合法（nil / 长度不对 / 含非十六进制字符）时**返回 false**，
    /// 而不是「没有摘要就当作通过」—— 后者等于给攻击者留一条「把摘要字段删掉」的路。
    public static func matches(_ data: Data, hex: String?) -> Bool {
        guard let hex, isValid(hex) else { return false }
        return sha256Hex(data).caseInsensitiveCompare(hex) == .orderedSame
    }
}

/// 内容清单（`catalog.json` / `category.<id>.json`）的**来源与完整性**。
///
/// ## 两个问题，两套机制
///
/// | 问题 | 机制 | 回答 |
/// | --- | --- | --- |
/// | 这份索引是作者发的吗？ | Ed25519 签名（本类型） | **来源** |
/// | 这个切片的内容被换过吗？ | 索引里的 `sha256`（`ContentDigest`） | **完整性** |
///
/// 两者缺一不可。签名只覆盖索引，而**播放用的条目在切片里** —— 控制
/// studio.meowv.com 的人（静态站被入侵、发布脚本被改、CDN 缓存被投毒、DNS/TLS 被绕过）
/// 改不动签名，但能手换一个切片，于是 `url` / `coverUrl` 就换了内容：
/// 前者是「下载并播放任意远端视频」，后者更直观 —— `coverUrl` 会被
/// `setDesktopImageURL` 写进系统墙纸。反过来，只有摘要没有签名也不行：
/// 摘要写在索引里，能改索引的人会把摘要与被改过的切片一起换掉
/// （这正是更新链那一节已经讲过的道理，见 `UpdateSignature`）。
///
/// 边界（已实测，不必再怀疑）：`CatalogCoding.sanitize` 用 `remoteURL` 过滤，
/// 远端**注入不了 `file://`**；`LivewallCategoryEntry.resolvedFileURL` 强制同源，
/// 切片指不到别的域。所以最坏情形是「任意视频 + 任意壁纸图」，不是任意代码执行。
///
/// ## 为什么只签索引，不逐个签切片
///
/// 切片是 N+1 个（当前 11 个）。逐个签名会让启动多打十来次请求；把摘要写进索引、
/// 只签索引，代价是**多 1 个请求**（`catalog.json.sig`），切片的完整性由
/// 「已验签的索引」传递性地保证。
///
/// ## 密钥与格式
///
/// 与更新清单**共用同一把密钥**、同一套签名文件格式与同一个信任锚
/// （`UpdateSignature.publicKeyBase64`）。私钥 `~/.livewall-signing/version-key.txt`
/// 只在本机离线保存，签名由 `tools/sign-version.swift` 产出。
///
/// **验不过就是不可用**：没有「验不过就退回只看 sha256」或「没有签名就按旧的来」这条路。
/// 那种降级等于没做 —— 攻击者把签名文件删掉即可绕过。理由与 `UpdateSignature` 完全一致。
public enum CatalogSignature {

    /// 索引里承载切片摘要的字段名。必须与生成侧写出的键名一致。
    public static let digestField = "sha256"

    /// 索引的签名文件地址（`…/catalog.json` → `…/catalog.json.sig`）。
    ///
    /// 与更新链共用同一套推导：路径为空或以 `/` 结尾（给的是目录）时推不出来，
    /// 返回 nil，调用方据此判不可用 —— **不猜**一个「大概是这样」的地址。
    public static func documentURL(for indexURL: URL) -> URL? {
        UpdateSignature.documentURL(for: indexURL)
    }

    /// 用**内嵌公钥**验签。`payload` 是索引的原始字节，`document` 是签名文件的内容。
    ///
    /// 转调 `UpdateSignature.verify`：签名格式、算法标识、长度检查、失败原因全都共用一份实现。
    /// 分开实现两套验签是这类机制最典型的烂法 —— 两边的严格程度迟早会分叉，
    /// 而分叉的方向通常是「其中一边松了」。
    public static func verify(payload: Data, document: Data) -> UpdateSignature.Outcome {
        UpdateSignature.verify(payload: payload, document: document)
    }

    /// 已验签的索引里，是否**全部及每条可拉取的分类切片都带合法摘要**。
    ///
    /// 通过时返回 nil，否则返回一句可直接进 warning 的原因。
    ///
    /// 这是**硬约束**而不是提醒：索引一旦验签通过，客户端就再也不会去看切片的来源，
    /// 只拿摘要比对。此时某个切片若没有摘要，那条路就成了「不校验」——
    /// 而「验不过就退回不校验」正是本类型明确拒绝的降级。
    /// 空分类（`file == nil`）没有文件，也就不需要摘要。
    public static func digestProblem(in index: LivewallCatalogIndex) -> String? {
        if let allSlice = index.allSlice {
            guard LivewallCategoryEntry.isSafeRelativeFileName(allSlice.file) else {
                return "全部切片文件名不合法"
            }
            guard allSlice.itemCount > 0 else {
                return "全部切片条目数必须大于 0"
            }
            guard ContentDigest.isValid(allSlice.sha256) else {
                return "全部切片 sha256 格式无效"
            }
        }
        var offenders: [String] = []
        for entry in index.categories {
            guard entry.file != nil else { continue }
            if !ContentDigest.isValid(entry.sha256) {
                offenders.append("\(entry.name)(\(entry.id))")
            }
        }
        guard offenders.isEmpty else {
            return "索引里的分类缺少合法的切片摘要：\(offenders.joined(separator: "、"))"
        }
        return nil
    }
}
