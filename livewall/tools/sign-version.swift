#!/usr/bin/env swift
import CryptoKit
import Foundation

// LiveWall 清单的**本机离线签名**工具。两类清单共用同一把密钥与同一套签名格式：
//
//   1. 更新清单 `version.json`（应用自身的版本与安装包）
//   2. 内容清单 `catalog.json`（壁纸清单索引；切片摘要写在索引里，见 `--catalog`）
//
// 为什么不用 openssl：本机是 LibreSSL 3.3.6，`genpkey -algorithm ED25519`
// 直接报 `Algorithm ED25519 not found` —— 它不支持 Ed25519。
// 而 CryptoKit 一直可用，于是签名工具用 Swift 写，零依赖、与客户端同一套实现
// （客户端验签也走 CryptoKit，不存在「两边实现不一致」的缝）。
//
// 用法（在 livewall/ 目录下执行）：
//
//     ./tools/sign-version.swift keygen                     # 生成私钥（只做一次）
//     ./tools/sign-version.swift sign --json <清单> --dmg <dmg>
//     ./tools/sign-version.swift sign --json <catalog.json> --catalog
//     ./tools/sign-version.swift verify --json <清单>
//
// 完整的发版流程见 livewall/README.md「版本检查与更新 → 发版步骤」。

// MARK: - 与客户端共用的约定
//
// 这三个值必须与 Sources/LiveWallCore/UpdateSignature.swift 保持一致，
// 改一边就必须改另一边（`verify` 会用内嵌公钥做端到端检查，不一致会立刻暴露）。

/// 签名算法标识，写进签名文件的 `alg` 字段。
let algorithm = "ed25519"
/// 签名文件的字段名。
let algorithmField = "alg"
let signatureField = "signature"
/// 客户端内嵌公钥所在的源文件（相对 livewall/）。
let publicKeySourceRelativePath = "Sources/LiveWallCore/UpdateSignature.swift"
/// 客户端源码里那个常量的名字，用于从源码中抠出公钥。
let publicKeyConstantName = "publicKeyBase64"

// MARK: - 小工具

let toolName = "tools/sign-version.swift"

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data(("错误：" + message + "\n").utf8))
    exit(1)
}

func warn(_ message: String) {
    FileHandle.standardError.write(Data(("警告：" + message + "\n").utf8))
}

func readFile(_ path: String, _ what: String) -> Data {
    guard let data = FileManager.default.contents(atPath: path) else {
        fail("读不到\(what)：\(path)")
    }
    return data
}

func writeFile(_ data: Data, to path: String) {
    do {
        try data.write(to: URL(fileURLWithPath: path), options: .atomic)
    } catch {
        fail("写文件失败：\(path)\n    \(error.localizedDescription)")
    }
}

func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

func defaultKeyPath() -> String {
    FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".livewall-signing/version-key.txt").path
}

/// 客户端源码里内嵌公钥的路径。先按当前目录找，再按脚本自身位置找 ——
/// 这样在 `livewall/` 里跑和在仓库根目录跑都能找到。
func defaultPublicKeySourcePath() -> String {
    let candidates = [
        FileManager.default.currentDirectoryPath + "/" + publicKeySourceRelativePath,
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // tools/
            .deletingLastPathComponent()   // livewall/
            .appendingPathComponent(publicKeySourceRelativePath).path,
    ]
    return candidates.first { FileManager.default.fileExists(atPath: $0) } ?? candidates[0]
}

/// 从客户端源码里抠出 `publicKeyBase64 = "..."` 的那个字符串字面量。
///
/// **单一信任锚**：`verify` 默认用它而不是用私钥推出来的公钥 ——
/// 要回答的问题是「客户端会不会接受这份签名」，只有内嵌公钥能回答。
/// 用私钥推出来的公钥验，只能证明「我自己签的东西我自己认」，等于没验。
func embeddedPublicKeyBase64(sourcePath: String) -> String {
    guard let data = FileManager.default.contents(atPath: sourcePath),
          let text = String(data: data, encoding: .utf8) else {
        fail("读不到客户端源码：\(sourcePath)\n    用 --pubkey-source 指定，或 --pubkey 直接给公钥。")
    }
    for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
        guard let nameRange = line.range(of: publicKeyConstantName) else { continue }
        guard let openQuote = line.range(of: "\"", range: nameRange.upperBound..<line.endIndex),
              let closeQuote = line.range(of: "\"", range: openQuote.upperBound..<line.endIndex) else {
            continue
        }
        let value = String(line[openQuote.upperBound..<closeQuote.lowerBound])
        guard !value.isEmpty else { continue }
        if value == "REPLACE_ME" {
            fail("""
            客户端源码里还没有内嵌公钥（\(publicKeyConstantName) 仍是占位符）：
                \(sourcePath)
                先跑 `\(toolName) keygen`，把它打印的那一行粘进去。
            """)
        }
        return value
    }
    fail("在 \(sourcePath) 里没找到 \(publicKeyConstantName) 的字符串值")
}

func publicKey(fromBase64 encoded: String, describedAs source: String) -> Curve25519.Signing.PublicKey {
    guard let raw = Data(base64Encoded: encoded) else {
        fail("\(source) 不是合法 base64：\(encoded)")
    }
    guard raw.count == 32 else {
        fail("\(source) 长度应为 32 字节，实际 \(raw.count) 字节")
    }
    do {
        return try Curve25519.Signing.PublicKey(rawRepresentation: raw)
    } catch {
        fail("\(source) 无法加载：\(error.localizedDescription)")
    }
}

/// 读私钥文件。跳过空行与 `#` 注释行，取第一条内容行 ——
/// 这样密钥文件里可以留「生成于哪天」这类备注，不用为了备注另开一个文件。
func loadPrivateKey(path: String) -> Curve25519.Signing.PrivateKey {
    guard let data = FileManager.default.contents(atPath: path),
          let text = String(data: data, encoding: .utf8) else {
        fail("读不到私钥文件：\(path)\n    先生成：\(toolName) keygen")
    }
    let payload = text
        .split(separator: "\n", omittingEmptySubsequences: false)
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .first { !$0.isEmpty && !$0.hasPrefix("#") }
    guard let payload else { fail("私钥文件里没有内容行：\(path)") }
    guard let raw = Data(base64Encoded: payload) else {
        fail("私钥不是合法 base64：\(path)")
    }
    guard raw.count == 32 else {
        fail("私钥长度应为 32 字节（Ed25519 原始值），实际 \(raw.count) 字节：\(path)")
    }
    do {
        return try Curve25519.Signing.PrivateKey(rawRepresentation: raw)
    } catch {
        fail("私钥无法加载：\(error.localizedDescription)")
    }
}

/// 把签名文件的内容拼出来。形状固定、base64 不需要转义，直接拼比过一遍
/// `JSONSerialization` 更可控（键顺序与缩进都是确定的，diff 友好）。
func documentText(signatureBase64: String) -> String {
    """
    {
      "\(algorithmField)": "\(algorithm)",
      "\(signatureField)": "\(signatureBase64)"
    }

    """
}

/// 解析签名文件，取出签名。返回 nil 表示格式不对，原因写进 `reason`。
func parseDocument(_ data: Data, reason: inout String) -> Data? {
    guard let any = try? JSONSerialization.jsonObject(with: data),
          let object = any as? [String: Any] else {
        reason = "签名文件不是 JSON 对象"
        return nil
    }
    guard let alg = (object[algorithmField] as? String)?
        .trimmingCharacters(in: .whitespacesAndNewlines), alg == algorithm else {
        reason = "签名算法不是 \(algorithm)"
        return nil
    }
    guard let encoded = (object[signatureField] as? String)?
        .trimmingCharacters(in: .whitespacesAndNewlines), !encoded.isEmpty,
          let signature = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters) else {
        reason = "缺少可用的 \(signatureField) 字段"
        return nil
    }
    guard signature.count == 64 else {
        reason = "签名长度应为 64 字节，实际 \(signature.count) 字节"
        return nil
    }
    return signature
}

// MARK: - 子命令

func commandKeygen(outPath: String, force: Bool) {
    if FileManager.default.fileExists(atPath: outPath), !force {
        fail("""
        私钥已存在，拒绝覆盖：\(outPath)
            覆盖 = 换密钥 = 所有已经发出去的客户端都再也验不过新签名。
            真要换：先备份旧私钥，再显式加 --force。
        """)
    }

    let key = Curve25519.Signing.PrivateKey()
    let publicKeyBase64 = key.publicKey.rawRepresentation.base64EncodedString()

    let directory = (outPath as NSString).deletingLastPathComponent
    if !directory.isEmpty {
        do {
            try FileManager.default.createDirectory(
                atPath: directory,
                withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700]
            )
        } catch {
            fail("创建目录失败：\(directory)\n    \(error.localizedDescription)")
        }
    }

    let formatter = ISO8601DateFormatter()
    let text = """
    # LiveWall version.json 签名私钥（Ed25519，32 字节原始值的 base64）。
    # 生成于 \(formatter.string(from: Date()))
    #
    # ⚠️ 备份它。丢了就再也签不出已发布客户端认得的签名 ——
    #    唯一的补救是换密钥并重新发一版客户端。
    # ⚠️ 不要提交进仓库，不要上传到任何服务器。本机离线用。
    \(key.rawRepresentation.base64EncodedString())

    """
    writeFile(Data(text.utf8), to: outPath)
    do {
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: outPath)
    } catch {
        warn("设置私钥权限失败（应手动 chmod 600）：\(error.localizedDescription)")
    }

    print("""
    ✓ 私钥已生成：\(outPath)（权限 600）
      **现在就去备份它。**

    公钥（下面这一行要粘进客户端源码）：
      \(publicKeySourceRelativePath)
      替换其中 \(publicKeyConstantName) 的值：

        public static let \(publicKeyConstantName) = "\(publicKeyBase64)"

    """)
}

func commandPubkey(keyPath: String) {
    let key = loadPrivateKey(path: keyPath)
    print(key.publicKey.rawRepresentation.base64EncodedString())
}

/// 目录清单（`catalog.json`）的摘要对账。
///
/// 索引里为每个**有内容的**分类记了它那份切片的 sha256。这里逐个回读切片文件、重算摘要比对 ——
/// 与 `--dmg` 那一步是同一个目的：**签名保护的是「这份清单是作者发的」，
/// 不保护「清单里写的摘要是对的」**。少了这道对账，一次「导出到一半被打断」、
/// 一次「手工替换了某个切片」就会签出一份**签名完全有效、但客户端逐个切片判完整性失败**的索引，
/// 而症状会先被归到 CDN 或网络上去。
func reconcileCatalog(payload: Data, jsonPath: String) {
    guard let any = try? JSONSerialization.jsonObject(with: payload),
          let object = any as? [String: Any] else {
        fail("\(jsonPath) 不是合法的 JSON，无法做目录清单对账。")
    }
    guard object["schemaVersion"] as? Int == 2,
          object["encryption"] as? String == "aes-256-gcm",
          object["encryptionVersion"] as? Int == 1,
          object["compression"] as? String == "gzip",
          let keyID = object["keyID"] as? String, keyID.count == 16,
          keyID.allSatisfy({ $0.isASCII && $0.isHexDigit }) else {
        fail("目录清单必须使用加密 schema v2 并包含合法的密钥标识。")
    }
    guard let categories = object["categories"] as? [[String: Any]] else {
        fail("""
        \(jsonPath) 里没有 categories 数组 —— 它看起来不是目录清单索引。
            若这是 version.json，请不要加 --catalog。
        """)
    }
    // 空索引是**不可用**产物：客户端的 `tryDecodeIndex` 判它解析失败并继续降级。
    // 签了也发不出去，不如在签名这一步就拦住。
    guard !categories.isEmpty else {
        fail("\(jsonPath) 的 categories 为空 —— 客户端会把空索引判为解析失败，这份清单签了也没有人能加载。")
    }

    let directory = (jsonPath as NSString).deletingLastPathComponent
    var checked = 0
    var problems: [String] = []

    for (offset, category) in categories.enumerated() {
        let id = (category["id"] as? Int).map(String.init) ?? "?"
        let name = (category["name"] as? String) ?? "?"
        let label = "第 \(offset + 1) 个分类（id=\(id)「\(name)」）"
        let file = (category["file"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let declared = (category["sha256"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let file, !file.isEmpty else {
            // 条目数为 0 的分类不落文件（客户端拿到空 items 会判解析失败），因此也不该有摘要。
            if let declared, !declared.isEmpty {
                problems.append("\(label)：没有 file，却带着 sha256 —— 客户端根本不会校验它，摘要成了摆设")
            }
            continue
        }
        // 这个文件名既用来拼 URL（客户端侧）、也用来拼本地路径（这一步）。
        // 带分隔符或 scheme 的值会让两边都跑到不该去的地方。
        guard file.hasSuffix(".bin"), !file.contains("/"), !file.contains("\\"), !file.contains(":") else {
            problems.append("\(label)：file 不合法（含路径分隔符或 scheme）：\(file)")
            continue
        }
        guard let declared, declared.count == 64,
              declared.allSatisfy({ $0.isHexDigit }) else {
            problems.append("\(label)：有 file（\(file)）却没有 64 位十六进制的 sha256 —— 客户端不会加载这份切片")
            continue
        }

        let path = directory + "/" + file
        guard FileManager.default.fileExists(atPath: path) else {
            problems.append("\(label)：索引指向的切片不存在：\(path)")
            continue
        }
        let actual = sha256Hex(readFile(path, "分类切片"))
        guard declared.caseInsensitiveCompare(actual) == .orderedSame else {
            problems.append("\(label)：摘要不符\n        索引：\(declared)\n        实际：\(actual)")
            continue
        }
        checked += 1
    }

    if let allSlice = object["allSlice"] as? [String: Any] {
        let file = (allSlice["file"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let declared = (allSlice["sha256"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let file, !file.isEmpty,
              !file.contains("/"), !file.contains("\\"), !file.contains(":"),
              file.hasSuffix(".bin"),
              file != ".", file != ".." else {
            fail("\(jsonPath) 的全部切片 file 缺失或不合法，拒绝签名。")
        }
        guard (allSlice["itemCount"] as? Int ?? 0) > 0 else {
            fail("\(jsonPath) 的全部切片 itemCount 必须大于 0，拒绝签名。")
        }
        guard let declared, declared.count == 64,
              declared.allSatisfy({ $0.isHexDigit }) else {
            fail("\(jsonPath) 的全部切片缺少合法的 64 位 sha256，拒绝签名。")
        }
        let path = directory + "/" + file
        guard FileManager.default.fileExists(atPath: path) else {
            fail("\(jsonPath) 的全部切片文件不存在：\(path)")
        }
        let actual = sha256Hex(readFile(path, "全部切片"))
        guard declared.caseInsensitiveCompare(actual) == .orderedSame else {
            fail("\(jsonPath) 的全部切片摘要不符\n        索引：\(declared)\n        实际：\(actual)")
        }
        checked += 1
    }

    guard problems.isEmpty else {
        fail("""
        索引里的切片摘要与实际文件不符，拒绝签名：
          \(problems.joined(separator: "\n  "))
        先重新导出一次（根目录 `./build.sh wallpapers`），再来签 ——
        否则会签出一份签名有效、但客户端逐个切片判完整性失败的清单。
        """)
    }

    print("✓ 摘要对账通过：\(checked) 个切片的 sha256 与索引一致")
}

func commandSign(
    jsonPath: String,
    dmgPath: String?,
    catalogMode: Bool,
    keyPath: String,
    outPath: String?,
    publicKeySourcePath: String?
) {
    if dmgPath != nil && catalogMode {
        fail("--dmg 与 --catalog 只能给一个：前者对账安装包，后者对账分类切片。")
    }

    let payload = readFile(jsonPath, "清单文件")

    // 1) 摘要对账。不做这一步，最容易发生的错误是「签了一份指向旧 dmg 的清单」——
    //    签名完全有效、客户端也验得过，但下载下来的包校验不符。
    //    签名保护的是「清单是作者发的」，不保护「清单里写的摘要是对的」，两者要分开守。
    if let dmgPath {
        let declared: String? = {
            guard let any = try? JSONSerialization.jsonObject(with: payload),
                  let object = any as? [String: Any],
                  let value = object["sha256"] as? String else { return nil }
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }()
        guard let declared else {
            fail("\(jsonPath) 里没有可用的 sha256 字段，无法与 dmg 对账。\n    先重新生成 version.json（make-dmg.sh 会写好 sha256）。")
        }
        let actual = sha256Hex(readFile(dmgPath, "dmg"))
        guard declared.caseInsensitiveCompare(actual) == .orderedSame else {
            fail("""
            清单里的 sha256 与实际 dmg 不符，拒绝签名：
                  清单：\(declared)
                  dmg ：\(actual)
                先重新生成 version.json 再来签 —— 否则会签出一份签名有效、
                但用户下载后校验必然失败的清单。
            """)
        }
        print("✓ 摘要对账通过：清单里的 sha256 与 \((dmgPath as NSString).lastPathComponent) 一致")
    } else if catalogMode {
        reconcileCatalog(payload: payload, jsonPath: jsonPath)
    } else {
        warn("没给 --dmg（也没给 --catalog），跳过摘要对账。清单里的 sha256 是否正确没有被检查。")
    }

    // 2) 签名。
    let key = loadPrivateKey(path: keyPath)
    let signature: Data
    do {
        signature = try key.signature(for: payload)
    } catch {
        fail("签名失败：\(error.localizedDescription)")
    }

    let target = outPath ?? jsonPath + ".sig"
    writeFile(Data(documentText(signatureBase64: signature.base64EncodedString()).utf8), to: target)

    // 3) 回读自检。把刚写出的文件重新读进来验一次，**并用客户端内嵌的公钥验**。
    //    签名的私钥与客户端内嵌的公钥不是一对，是这套机制最容易犯的错，
    //    症状极隐蔽：本地一切正常，用户那边永远不提示更新。
    //    这一步就是为了让那种错误在发版当场就炸出来。
    //
    //    ⚠️ 这里必须是**验签**，不能改成「重签一次比对是否相同」：
    //    CryptoKit 的 Ed25519 带随机化 nonce（Apple 文档明说如此），同一段字节连签两次
    //    结果**不同**，比对会永远判失败，看起来像密钥不匹配 —— 而实际上一切都对。
    let written = readFile(target, "刚写出的签名文件")
    var reason = ""
    guard let reparsed = parseDocument(written, reason: &reason) else {
        try? FileManager.default.removeItem(atPath: target)
        fail("自检失败：刚写出的签名文件读不回来（\(reason)）。已删除该文件。")
    }
    guard key.publicKey.isValidSignature(reparsed, for: payload) else {
        try? FileManager.default.removeItem(atPath: target)
        fail("自检失败：签名与清单不符。已删除该文件。")
    }

    let sourcePath = publicKeySourcePath ?? defaultPublicKeySourcePath()
    let embedded = publicKey(fromBase64: embeddedPublicKeyBase64(sourcePath: sourcePath),
                            describedAs: "客户端内嵌公钥")
    let endToEnd = embedded.isValidSignature(reparsed, for: payload)
    if !endToEnd {
        try? FileManager.default.removeItem(atPath: target)
        fail("""
        自检失败：**客户端内嵌的公钥验不过这份签名**，已删除该文件。
            说明签名用的私钥与客户端里内嵌的公钥不是一对。
            检查 \(sourcePath)
            里 \(publicKeyConstantName) 的值是不是当前私钥对应的公钥：
                \(toolName) pubkey
        """)
    }

    // 收尾提示按模式分开写。两者的「少传一个」症状完全不同，用同一句话会把人带到错的方向：
    // 更新清单少签名 = 看不到新版本；内容清单少签名 = 客户端拿不到任何清单（连菜单都没有）。
    let hint =
        catalogMode
        ? "只传一个的表现是「客户端拉不到清单，只剩内建兜底」—— 菜单里可能什么都没有。"
        : "只传一个的表现是「客户端永远不提示更新」。"
    print("""
    ✓ 已签名：\(target)
      ✓ 自检通过（回读后验签通过）
      ✓ 端到端通过（客户端内嵌公钥验得过）

    别忘了把 \(target) 与 \(jsonPath) **一起**上传 —— 两个文件必须同一次发布，
    \(hint)
    """)
}

func commandVerify(jsonPath: String, sigPath: String?, keyPath: String?, publicKeyBase64: String?, sourcePath: String?) {
    let payload = readFile(jsonPath, "版本信息文件")
    let target = sigPath ?? jsonPath + ".sig"
    let document = readFile(target, "签名文件")

    let key: Curve25519.Signing.PublicKey
    let source: String
    if let publicKeyBase64 {
        key = publicKey(fromBase64: publicKeyBase64, describedAs: "命令行给的公钥")
        source = "--pubkey"
    } else if let keyPath {
        key = loadPrivateKey(path: keyPath).publicKey
        source = "由私钥推出（\(keyPath)）"
    } else {
        let path = sourcePath ?? defaultPublicKeySourcePath()
        key = publicKey(fromBase64: embeddedPublicKeyBase64(sourcePath: path), describedAs: "客户端内嵌公钥")
        source = "客户端内嵌（\(path)）"
    }

    var reason = ""
    guard let signature = parseDocument(document, reason: &reason) else {
        fail("签名文件不可用：\(reason)\n    \(target)")
    }
    guard key.isValidSignature(signature, for: payload) else {
        fail("""
        验签不通过：签名与清单不符。
            清单：\(jsonPath)（\(payload.count) 字节，sha256 \(sha256Hex(payload))）
            签名：\(target)
            公钥来源：\(source)

            最常见的原因是**清单被重新格式化过** —— 签名覆盖的是原始字节，
            改缩进、调键顺序、加删尾随换行都会让签名失效。
            发布时请原样上传，别在编辑器里「顺手格式化」。
        """)
    }

    print("""
    ✓ 验签通过
      清单：\(jsonPath)（\(payload.count) 字节）
      签名：\(target)
      公钥来源：\(source)
    """)
}

func usage() -> Never {
    print("""
    LiveWall 更新清单签名工具（Ed25519，本机离线）

    用法：\(toolName) <子命令> [选项]

    子命令：
      keygen                          生成私钥，并打印要粘进客户端源码的公钥行
        --out PATH                      私钥路径（默认 ~/.livewall-signing/version-key.txt）
        --force                         已存在也覆盖（等于换密钥，慎用）

      pubkey                          由私钥推出公钥（核对用）
        --key PATH                      私钥路径

      sign                            对清单的**原始字节**签名，写出 <清单>.sig
        --json PATH                     要签的清单（必填）
        --dmg PATH                      dmg 文件；给了就先校验清单里的 sha256 与它一致
        --catalog                       把 --json 当作目录清单**索引**：逐个校验它记的
                                        分类切片 sha256 与同目录下的实际文件是否一致
        --key PATH                      私钥路径
        --out PATH                      签名文件路径（默认 <清单>.sig）
        --pubkey-source PATH            客户端源码路径（默认自动定位）

      verify                          验签
        --json PATH                     清单（必填）
        --sig PATH                      签名文件（默认 <清单>.sig）
        --key PATH                      改用某个私钥推出的公钥验（默认用客户端内嵌公钥）
        --pubkey BASE64                 直接指定公钥
        --pubkey-source PATH            客户端源码路径（默认自动定位）

    示例：
      \(toolName) keygen
      \(toolName) sign --json build/studio.meowv.com/data/livewall/version.json \\
                        --dmg build/LiveWall-0.2.0.dmg
      \(toolName) sign --json studio/public/data/livewall/catalog.json --catalog
      \(toolName) verify --json build/studio.meowv.com/data/livewall/version.json
    """)
    exit(0)
}

// MARK: - 入口

let arguments = Array(CommandLine.arguments.dropFirst())
guard let command = arguments.first, !command.hasPrefix("--") else { usage() }

var options: [String: String] = [:]
var flags: Set<String> = []
var index = 1
while index < arguments.count {
    let argument = arguments[index]
    guard argument.hasPrefix("--") else {
        fail("看不懂的参数：\(argument)\n    跑 `\(toolName)` 看用法。")
    }
    let name = String(argument.dropFirst(2))
    if index + 1 < arguments.count, !arguments[index + 1].hasPrefix("--") {
        options[name] = arguments[index + 1]
        index += 2
    } else {
        flags.insert(name)
        index += 1
    }
}

switch command {
case "keygen":
    commandKeygen(outPath: options["out"] ?? defaultKeyPath(), force: flags.contains("force"))

case "pubkey":
    commandPubkey(keyPath: options["key"] ?? defaultKeyPath())

case "sign":
    guard let json = options["json"] else { fail("sign 需要 --json <清单路径>") }
    commandSign(
        jsonPath: json,
        dmgPath: options["dmg"],
        catalogMode: flags.contains("catalog"),
        keyPath: options["key"] ?? defaultKeyPath(),
        outPath: options["out"],
        publicKeySourcePath: options["pubkey-source"]
    )

case "verify":
    guard let json = options["json"] else { fail("verify 需要 --json <清单路径>") }
    commandVerify(
        jsonPath: json,
        sigPath: options["sig"],
        keyPath: options["key"],
        publicKeyBase64: options["pubkey"],
        sourcePath: options["pubkey-source"]
    )

case "-h", "help", "--help":
    usage()

default:
    fail("未知子命令：\(command)\n    跑 `\(toolName)` 看用法。")
}
