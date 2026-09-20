#!/usr/bin/env python3
"""把明文常量编码成 `Folded.open` 能还原的 `[UInt8]` 字面量。

用途：服务端地址这类不希望以明文形式落进二进制的常量，先在这里编码，
再把输出粘进 Swift 源码（见 `Sources/LiveWallCore/PackedText.swift`，
里面的类型叫 `Folded` —— 类型名刻意混淆，见该文件说明）。

用法：
    python3 tools/encode-strings.py "https://example.com/a" "https://example.com/b"

输出每行是一条可直接替换的 `[UInt8]` 字面量，注释里保留明文方便对照。

⚠️ KEY 必须与 `Sources/LiveWallCore/PackedText.swift` 里的 `key` 逐字节一致。
   两处不同步时，运行时还原出来的是乱码 —— 但不会静默：`LiveWallCoreTests`
   断言了还原后的 URL 值，编码错了会立刻红。
"""

# 与 PackedText.swift 的 `key` 保持一致（16 字节）。
KEY = [
    0x5A, 0xC3, 0x11, 0x7E, 0x9F, 0x24, 0x6B, 0xD0,
    0x38, 0xA5, 0x4C, 0xE7, 0x02, 0xB9, 0x57, 0xF1,
]

PER_LINE = 12


def encode(text: str) -> list[int]:
    data = text.encode("utf-8")
    return [byte ^ KEY[i % len(KEY)] for i, byte in enumerate(data)]


def format_bytes(values: list[int], indent: str = "        ") -> str:
    lines = []
    for start in range(0, len(values), PER_LINE):
        chunk = values[start:start + PER_LINE]
        lines.append(indent + ", ".join(f"0x{byte:02X}" for byte in chunk) + ",")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    for text in argv:
        print(f"// {text}")
        print("    [")
        print(format_bytes(encode(text)))
        print("    ]")
        print()
    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(main(sys.argv[1:]))
