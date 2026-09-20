import Foundation

/// 混淆字符串常量的运行时还原器。
///
/// **目的**：把服务端地址这类常量以「与密钥异或后的字节」形式存进二进制，
/// 让 `strings` / `otool -s __TEXT __cstring` 扫不出明文，抬高「改个 URL
/// 重新打包再分发」的门槛。
///
/// **边界（务必理解）**：这不是密码学保护。密钥就在同一个二进制里，决心足够的人
/// 仍能静态还原。它挡的是随手 grep 级别的侦察，不挡逆向工程 —— 别把它当成
/// 保护密钥或算法的方案。
///
/// **生成方式**：明文 → 字节数组一律用 `tools/encode-strings.py` 算，不要手算。
/// 该脚本的 KEY 必须与本文件的 `key` 逐字节一致；不同步会让还原结果变成乱码，
/// 但不会静默 —— `LiveWallCoreTests` 断言了还原后的 URL，编码错了会立刻失败。
///
/// **类型名 `Folded` 是刻意混淆的，别「顺手改回来」。**
///
/// 二进制里的 Swift mangled name 会带上类型名 —— 叫 `PackedText` 就等于在 `strings`
/// 输出里写明「这里有字符串混淆」，等于给逆向的人指路。文件名保持描述性（便于维护），
/// 类型名不透露用途，这个错配是有意为之。
enum Folded {

    /// 异或密钥，逐字节循环使用。
    ///
    /// 写成 `[UInt8]` 而不是字符串，避免密钥自己以可读文本落进二进制。
    private static let key: [UInt8] = [
        0x5A, 0xC3, 0x11, 0x7E, 0x9F, 0x24, 0x6B, 0xD0,
        0x38, 0xA5, 0x4C, 0xE7, 0x02, 0xB9, 0x57, 0xF1,
    ]

    /// 还原一个由 `tools/encode-strings.py` 生成的字节数组。
    ///
    /// `@inline(never)` 是**必需的**：否则 `-O` 下的优化器可能把字面量常量
    /// 折叠成结果字符串写回二进制，混淆就白做了。改这个函数时别把这个标注去掉。
    @inline(never)
    static func open(_ encoded: [UInt8]) -> String {
        var bytes = encoded
        let key = Self.key
        for index in bytes.indices {
            bytes[index] ^= key[index % key.count]
        }
        return String(decoding: bytes, as: UTF8.self)
    }
}
