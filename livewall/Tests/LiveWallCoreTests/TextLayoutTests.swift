import Foundation
import LiveWallCore

/// TextLayout 的测试。
/// 这个工具的存在理由就是「中文占两列」，所以断言必须覆盖全角字符的宽度。
func textLayoutTests() {
    suite("TextLayout.displayWidth") {

        test("ASCII 字符每个占 1 列") {
            expectEqual(TextLayout.displayWidth("abc"), 3, "abc")
            expectEqual(TextLayout.displayWidth(""), 0, "空串")
            expectEqual(TextLayout.displayWidth("a b"), 3, "含空格")
        }

        test("中文每个占 2 列") {
            expectEqual(TextLayout.displayWidth("访达"), 4, "访达")
            expectEqual(TextLayout.displayWidth("墙纸"), 4, "墙纸")
            expectEqual(TextLayout.displayWidth("程序坞"), 6, "程序坞")
        }

        test("中英混排按各自宽度累加") {
            // "访达 (Finder)" = 4 + 1 + 8 = 13
            expectEqual(TextLayout.displayWidth("访达 (Finder)"), 13, "中英混排")
        }

        test("全角标点算 2 列") {
            expectEqual(TextLayout.displayWidth("，"), 2, "全角逗号")
            expectEqual(TextLayout.displayWidth("（）"), 4, "全角括号")
        }
    }

    suite("TextLayout.pad") {

        test("补齐后的显示宽度等于目标宽度") {
            for value in ["abc", "访达", "程序坞", "访达 (Finder)"] {
                for width in [4, 10, 20, 26] {
                    let padded = TextLayout.pad(value, width)
                    let actual = TextLayout.displayWidth(padded)
                    if TextLayout.displayWidth(value) < width {
                        expectEqual(actual, width, "pad(\"\(value)\", \(width)) 的显示宽度")
                    } else {
                        expectEqual(padded, value, "超宽时 pad(\"\(value)\", \(width)) 应原样返回")
                    }
                }
            }
        }

        test("中文列按显示宽度对齐（这正是用 count 补齐会错位的场景）") {
            let a = TextLayout.pad("访达", 10)
            let b = TextLayout.pad("Dynamic Wallpaper", 10)
            // "访达" 显示宽 4 → 补 6 空格；"Dynamic Wallpaper" 显示宽 17 超宽 → 原样
            expectEqual(TextLayout.displayWidth(a), 10, "访达补齐后")
            expectEqual(b, "Dynamic Wallpaper", "超宽项原样返回")
        }

        test("超宽时不截断（截断会丢信息）") {
            expectEqual(TextLayout.pad("abcdef", 3), "abcdef", "超宽应原样返回")
        }

        test("宽度为 0 时原样返回") {
            expectEqual(TextLayout.pad("abc", 0), "abc", "宽度 0")
        }
    }

    suite("TextLayout.padLeft") {

        test("右对齐后显示宽度等于目标宽度") {
            expectEqual(TextLayout.displayWidth(TextLayout.padLeft("42", 8)), 8, "padLeft(\"42\", 8)")
            expectEqual(TextLayout.displayWidth(TextLayout.padLeft("访达", 8)), 8, "padLeft(\"访达\", 8)")
        }

        test("补的是左侧空格") {
            expectEqual(TextLayout.padLeft("42", 5), "   42", "padLeft(\"42\", 5)")
        }

        test("中文右对齐：访达(4列) 补到 10 列应是 6 个空格") {
            expectEqual(TextLayout.padLeft("访达", 10), "      访达", "padLeft(\"访达\", 10)")
        }

        test("超宽时不截断") {
            expectEqual(TextLayout.padLeft("abcdef", 3), "abcdef", "超宽应原样返回")
        }
    }
}
