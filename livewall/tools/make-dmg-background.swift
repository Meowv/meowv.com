#!/usr/bin/env swift
// 生成 DMG 安装窗口的背景图（「拖到应用程序文件夹」那套版式的底图）。
//
// 用法：
//   ./tools/make-dmg-background.swift --out-dir <目录>
//
// 产物：
//   <out-dir>/dmg-background.png      1x，760×480 pt
//   <out-dir>/dmg-background@2x.png   2x，1520×960 px
//
// 由 make-dmg.sh 在打包时调用；图标坐标由 make-dmg.sh 设置，并与本文件中的位置对应。
//
// 版式与 make-dmg.sh 里的图标坐标是**成对**的：改这里的坐标常量，
// 必须同步改 make-dmg.sh 的 `APP_ITEM_POS` / `DROP_ITEM_POS`，否则箭头指不到图标上。
//
// 配色取自 AppIcon.icns 的四瓣风车（蓝/红/橙/绿），别凭肉眼改。

import AppKit

// ── 版式常量（与 make-dmg.sh 共享的真相）────────────────
// 窗口内容区尺寸，单位 pt。make-dmg.sh 的窗口 bounds 高度 = 本值 + 标题栏高度（28）。
let canvasWidthPt: CGFloat = 760
let canvasHeightPt: CGFloat = 480

/// 左侧 App 图标中心。Finder 的 `set position` 给的就是**图标中心**，不是左上角。
let appIconCenter = NSPoint(x: 180, y: 252)
/// 右侧「应用程序」别名中心。
let dropLinkCenter = NSPoint(x: 580, y: 252)

// ── 品牌色（自 AppIcon.icns 采样）──────────────────────
func brand(_ r: Int, _ g: Int, _ b: Int, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: a)
}
let brandBlue = brand(0x43, 0x88, 0xF7)
let brandRed = brand(0xFF, 0x5D, 0x73)
let brandOrange = brand(0xFF, 0xB2, 0x24)
let brandGreen = brand(0x20, 0xB8, 0x75)
let textColor = brand(0x53, 0x59, 0x66)
let hintColor = brand(0x8A, 0x91, 0x9D)

/// 顶部品牌签名条：四段实色，对应图标的四瓣。
let brandStripeColors = [brandBlue, brandRed, brandOrange, brandGreen]

// ── 由命令行注入 ───────────────────────────────────────
var outDir = "Resources/dmg"

// ── 绘制 ───────────────────────────────────────────────
/// 把「距顶部 t pt」换算成 AppKit 的左下原点纵坐标。
func yFromTop(_ t: CGFloat) -> CGFloat { canvasHeightPt - t }

func drawBackground() {
    // 1) 底色：白到极浅冷灰的竖向渐变，边缘接近纯色 —— 这样窗口尺寸差几个 pt 也看不出来
    let base = NSGradient(colors: [brand(0xFF, 0xFF, 0xFF), brand(0xF1, 0xF4, 0xF9)])!
    base.draw(in: NSRect(x: 0, y: 0, width: canvasWidthPt, height: canvasHeightPt), angle: -90)

    // 2) 顶部品牌签名条
    let stripeHeight: CGFloat = 3
    let segmentWidth = canvasWidthPt / CGFloat(brandStripeColors.count)
    for (index, color) in brandStripeColors.enumerated() {
        color.setFill()
        NSRect(
            x: CGFloat(index) * segmentWidth,
            y: canvasHeightPt - stripeHeight,
            width: segmentWidth,
            height: stripeHeight
        ).fill()
    }

    // 3) 主文案。窗口缩到 760 宽后 14pt 显得太小，提到 17pt。
    let title = "拖到「应用程序」文件夹以安装"
    let titleAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 17, weight: .medium),
        .foregroundColor: textColor,
        .kern: 0.3,
    ]
    let titleString = NSAttributedString(string: title, attributes: titleAttrs)
    let titleSize = titleString.size()
    titleString.draw(at: NSPoint(
        x: (canvasWidthPt - titleSize.width) / 2,
        y: yFromTop(74) - titleSize.height / 2
    ))

    // 4) 副文案：给不了解 DMG 的人一句兜底说明
    let hint = "首次打开若被系统拦下，右键点 App 选「打开」"
    let hintAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 12.5, weight: .regular),
        .foregroundColor: hintColor,
    ]
    let hintString = NSAttributedString(string: hint, attributes: hintAttrs)
    let hintSize = hintString.size()
    hintString.draw(at: NSPoint(
        x: (canvasWidthPt - hintSize.width) / 2,
        y: yFromTop(100) - hintSize.height / 2
    ))

    // 5) 箭头：杆 + 实心三角头，品牌蓝；两端与 128 pt 图标相隔 18 pt。
    let arrowY = yFromTop(appIconCenter.y)
    let iconRadius: CGFloat = 64
    let arrowGap: CGFloat = 18
    let shaftStartX = appIconCenter.x + iconRadius + arrowGap
    let tipX = dropLinkCenter.x - iconRadius - arrowGap
    let shaftEndX = tipX - 44
    let headHalfHeight: CGFloat = 19

    let shaft = NSBezierPath()
    shaft.move(to: NSPoint(x: shaftStartX, y: arrowY))
    shaft.line(to: NSPoint(x: shaftEndX, y: arrowY))
    shaft.lineWidth = 6
    shaft.lineCapStyle = .round
    brandBlue.setStroke()
    shaft.stroke()

    let head = NSBezierPath()
    head.move(to: NSPoint(x: tipX, y: arrowY))
    head.line(to: NSPoint(x: shaftEndX - 5, y: arrowY + headHalfHeight))
    head.line(to: NSPoint(x: shaftEndX - 5, y: arrowY - headHalfHeight))
    head.close()
    brandBlue.setFill()
    head.fill()

    // 6) 底部品牌落款：四色小圆点，居中
    let dotRadius: CGFloat = 3
    let dotGap: CGFloat = 14
    let dotsWidth = CGFloat(brandStripeColors.count - 1) * dotGap
    let dotsStartX = (canvasWidthPt - dotsWidth) / 2
    for (index, color) in brandStripeColors.enumerated() {
        let centerX = dotsStartX + CGFloat(index) * dotGap
        color.setFill()
        NSBezierPath(ovalIn: NSRect(
            x: centerX - dotRadius,
            y: yFromTop(424) - dotRadius,
            width: dotRadius * 2,
            height: dotRadius * 2
        )).fill()
    }
}

func render(scale: Int, to path: String) throws {
    let pixelWidth = Int(canvasWidthPt) * scale
    let pixelHeight = Int(canvasHeightPt) * scale
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: pixelWidth,
        pixelsHigh: pixelHeight,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        throw NSError(domain: "make-dmg-background", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "无法创建位图缓冲"])
    }
    // 让位图以 pt 为单位 —— 2x 产物才会被标注成 144dpi
    rep.size = NSSize(width: canvasWidthPt, height: canvasHeightPt)

    guard let context = NSGraphicsContext(bitmapImageRep: rep) else {
        throw NSError(domain: "make-dmg-background", code: 2,
                      userInfo: [NSLocalizedDescriptionKey: "无法创建绘图上下文"])
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.cgContext.setShouldAntialias(true)
    drawBackground()
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()

    guard let png = rep.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "make-dmg-background", code: 3,
                      userInfo: [NSLocalizedDescriptionKey: "PNG 编码失败"])
    }
    try png.write(to: URL(fileURLWithPath: path))
    print("[bg] \(path)  \(pixelWidth)×\(pixelHeight) px")
}

// ── 参数 ───────────────────────────────────────────────
func usage() {
    print("""
    用法：make-dmg-background.swift [选项]

    选项：
      --out-dir <目录>      产物目录（默认 Resources/dmg）
      -h, --help            显示本帮助
    """)
}

var args = Array(CommandLine.arguments.dropFirst())
while !args.isEmpty {
    let arg = args.removeFirst()
    switch arg {
    case "--out-dir":
        guard !args.isEmpty else {
            FileHandle.standardError.write(Data("错误：--out-dir 缺少参数\n".utf8))
            exit(2)
        }
        outDir = args.removeFirst()
    case "-h", "--help":
        usage()
        exit(0)
    default:
        FileHandle.standardError.write(Data("错误：未知参数 \(arg)\n".utf8))
        usage()
        exit(2)
    }
}

let fileManager = FileManager.default
try fileManager.createDirectory(atPath: outDir, withIntermediateDirectories: true)
let base = (outDir as NSString).appendingPathComponent("dmg-background")
try render(scale: 1, to: base + ".png")
try render(scale: 2, to: base + "@2x.png")
