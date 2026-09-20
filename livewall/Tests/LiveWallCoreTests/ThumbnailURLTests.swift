import Foundation
import LiveWallCore

private func coverItem(
    id: Int = 1,
    coverUrl: String? = "https://cdn-ali-img-livebz.shanhutech.cn/livebz/1.jpg"
) -> WallpaperItem {
    WallpaperItem(
        id: id,
        title: "W\(id)",
        author: "A",
        url: "https://cdn.test/\(id).mp4",
        coverUrl: coverUrl
    )
}

/// 缩略图地址拼装。
///
/// 这里的期望值是 2026-09-20 对着线上 CDN 实测过的参数格式
/// （`?x-oss-process=image/resize,w_360/quality,q_80`，实测 384 KB → 10.3 KB），
/// 断言写死具体字符串是为了锁住格式 —— 一旦被谁改成 `URLComponents` 拼装，
/// 值里的 `/` 会被百分号编码，这组测试会立刻失败。
func thumbnailURLTests() {
    suite("缩略图地址") {

        test("给普通地址加上处理参数") {
            guard let cover = URL(string: "https://cdn.test/a.jpg"),
                  let resized = ThumbnailURL.resized(cover, width: 360) else {
                expect(false, "应能拼出缩略图地址")
                return
            }
            expectEqual(
                resized.absoluteString,
                "https://cdn.test/a.jpg?x-oss-process=image/resize,w_360/quality,q_80",
                "参数格式应与实测一致"
            )
        }

        test("地址里已有 query 时用 & 追加，不覆盖既有参数") {
            guard let cover = URL(string: "https://cdn.test/a.jpg?v=2"),
                  let resized = ThumbnailURL.resized(cover, width: 720) else {
                expect(false, "应能拼出缩略图地址")
                return
            }
            expectEqual(
                resized.absoluteString,
                "https://cdn.test/a.jpg?v=2&x-oss-process=image/resize,w_720/quality,q_80",
                "应保留原参数并用 & 追加"
            )
        }

        test("非法宽度返回 nil") {
            guard let cover = URL(string: "https://cdn.test/a.jpg") else {
                expect(false, "测试前置地址应能解析")
                return
            }
            expectNil(ThumbnailURL.resized(cover, width: 0), "宽度 0 应被拒")
            expectNil(ThumbnailURL.resized(cover, width: -10), "负宽度应被拒")
        }

        test("网格缩略图用 360，预览静态图用 720") {
            let item = coverItem()
            expectEqual(
                ThumbnailURL.grid(for: item)?.absoluteString,
                "https://cdn-ali-img-livebz.shanhutech.cn/livebz/1.jpg?x-oss-process=image/resize,w_360/quality,q_80",
                "网格档应是 w_360"
            )
            expectEqual(
                ThumbnailURL.preview(for: item)?.absoluteString,
                "https://cdn-ali-img-livebz.shanhutech.cn/livebz/1.jpg?x-oss-process=image/resize,w_720/quality,q_80",
                "预览档应是 w_720"
            )
            expectEqual(ThumbnailURL.gridWidth, 360, "网格宽度常量应为 360")
            expectEqual(ThumbnailURL.previewWidth, 720, "预览宽度常量应为 720")
        }

        test("coverUrl 缺失或非法时返回 nil，不伪造地址") {
            expectNil(ThumbnailURL.grid(for: coverItem(coverUrl: nil)), "缺失应返回 nil")
            expectNil(ThumbnailURL.grid(for: coverItem(coverUrl: "")), "空串应返回 nil")
            expectNil(ThumbnailURL.grid(for: coverItem(coverUrl: "   ")), "全空白应返回 nil")
            expectNil(ThumbnailURL.grid(for: coverItem(coverUrl: "ftp://cdn.test/a.jpg")), "非 http(s) 应返回 nil")
            expectNil(ThumbnailURL.preview(for: coverItem(coverUrl: nil)), "预览档同样返回 nil")
        }

        test("候选链：先处理版，再退回原图") {
            let item = coverItem()
            let chain = ThumbnailURL.gridCandidates(for: item)
            expectEqual(chain.count, 2, "应有两级候选")
            expectEqual(
                chain[0].absoluteString,
                "https://cdn-ali-img-livebz.shanhutech.cn/livebz/1.jpg?x-oss-process=image/resize,w_360/quality,q_80",
                "第一级应是处理版"
            )
            expectEqual(
                chain[1].absoluteString,
                "https://cdn-ali-img-livebz.shanhutech.cn/livebz/1.jpg",
                "第二级应是原图"
            )
        }

        test("没有 coverUrl 时候选链为空") {
            expectEqual(ThumbnailURL.gridCandidates(for: coverItem(coverUrl: nil)).count, 0, "无地址时链为空")
            expectEqual(ThumbnailURL.previewCandidates(for: coverItem(coverUrl: nil)).count, 0, "无地址时链为空")
        }

        test("原图地址复用 coverImageURL 的校验口径") {
            expectNotNil(ThumbnailURL.original(for: coverItem()), "合法地址应有原图")
            expectNil(ThumbnailURL.original(for: coverItem(coverUrl: "ftp://cdn.test/a.jpg")), "非 http(s) 应不可用")
        }
    }
}
