import Foundation
import LiveWallCore

private func httpError(_ description: String) -> NSError {
    NSError(
        domain: "AVFoundationErrorDomain",
        code: -11800,
        userInfo: [NSLocalizedDescriptionKey: description]
    )
}

func failurePolicyTests() {
    suite("FailurePolicy.classify") {

        test("网络类 URLError 归类正确") {
            expectEqual(FailurePolicy.classify(URLError(.notConnectedToInternet)), .networkUnreachable, "未联网")
            expectEqual(FailurePolicy.classify(URLError(.networkConnectionLost)), .networkUnreachable, "连接丢失")
            expectEqual(FailurePolicy.classify(URLError(.dataNotAllowed)), .networkUnreachable, "蜂窝数据被禁")

            if case .transientNetwork = FailurePolicy.classify(URLError(.timedOut)) {
                expect(true, "超时 → 临时网络故障")
            } else {
                expect(false, "超时 → 临时网络故障")
            }
            if case .transientNetwork = FailurePolicy.classify(URLError(.cannotFindHost)) {
                expect(true, "DNS 失败 → 临时网络故障")
            } else {
                expect(false, "DNS 失败 → 临时网络故障")
            }
        }

        test("从 HTTP 状态码分类（首选入口）") {
            expectEqual(FailurePolicy.classify(httpStatus: 404), .resourceGone(status: 404), "404")
            expectEqual(FailurePolicy.classify(httpStatus: 403), .resourceGone(status: 403), "403")
            expectEqual(FailurePolicy.classify(httpStatus: 410), .resourceGone(status: 410), "410 Gone")
            expectEqual(FailurePolicy.classify(httpStatus: 429), .resourceGone(status: 429), "其余 4xx 也按资源问题处理")
            expectEqual(FailurePolicy.classify(httpStatus: 500), .serverError(status: 500), "500")
            expectEqual(FailurePolicy.classify(httpStatus: 502), .serverError(status: 502), "502")
            expectEqual(FailurePolicy.classify(httpStatus: 503), .serverError(status: 503), "503")
            if case .unknown = FailurePolicy.classify(httpStatus: 301) {
                expect(true, "3xx 不属于 4xx/5xx，归为 unknown")
            } else {
                expect(false, "3xx 应归为 unknown")
            }
        }

        test("AVFoundation 的真实 404 描述不含状态码，所以不能靠解析文本") {
            // 实测：`asset.load(.isPlayable)` 对 404 抛出的本地化描述就是这个字符串，
            // 里面**没有任何数字**。曾试图用正则从错误文本里捞状态码，被这条实测证伪。
            // 这就是 `VideoLoader` 必须先做 HEAD 探测的原因。
            let real404 = NSError(
                domain: "AVFoundationErrorDomain",
                code: -11800,
                userInfo: [NSLocalizedDescriptionKey: "在此服务器上找不到所请求的URL。"]
            )
            if case .unknown = FailurePolicy.classify(real404) {
                expect(true, "文本里没有状态码，只能归为 unknown")
            } else {
                expect(false, "不应从文本里猜出状态码，实际 \(FailurePolicy.classify(real404))")
            }
        }

        test("VideoLoadError.httpStatus 会被正确分类") {
            expectEqual(FailurePolicy.classify(VideoLoadError.httpStatus(404)), .resourceGone(status: 404), "404")
            expectEqual(FailurePolicy.classify(VideoLoadError.httpStatus(503)), .serverError(status: 503), "503")
            expectEqual(FailurePolicy.classify(VideoLoadError.httpStatus(401)), .resourceGone(status: 401), "401")
        }

        test("VideoLoadError 归类正确") {
            expectEqual(FailurePolicy.classify(VideoLoadError.notPlayable), .notPlayable("资源不可播放"), "不可播放")
            expectEqual(FailurePolicy.classify(VideoLoadError.noVideoTrack), .notPlayable("没有视频轨道"), "无视频轨")
            expectEqual(FailurePolicy.classify(VideoLoadError.badDuration), .notPlayable("时长不可解析"), "时长异常")
            if case .transientNetwork = FailurePolicy.classify(VideoLoadError.network("连接被重置")) {
                expect(true, "VideoLoadError.network → 临时网络故障")
            } else {
                expect(false, "VideoLoadError.network → 临时网络故障")
            }
        }

        test("无法归类的错误归为 unknown") {
            if case .unknown = FailurePolicy.classify(httpError("something went wrong")) {
                expect(true, "未知错误")
            } else {
                expect(false, "未知错误")
            }
        }

        test("isResourceProblem 只对资源本身的问题为真") {
            expect(PlaybackFailureKind.resourceGone(status: 404).isResourceProblem, "404 是资源问题")
            expect(PlaybackFailureKind.notPlayable("x").isResourceProblem, "不可解码是资源问题")
            expect(!PlaybackFailureKind.networkUnreachable.isResourceProblem, "断网不是资源问题")
            expect(!PlaybackFailureKind.transientNetwork("timeout").isResourceProblem, "超时不是资源问题")
            expect(!PlaybackFailureKind.serverError(status: 503).isResourceProblem, "5xx 不是资源问题")
            expect(!PlaybackFailureKind.unknown("x").isResourceProblem, "未知不是资源问题")
        }
    }

    suite("FailurePolicy.action") {

        let policy = FailurePolicy(maxConsecutiveFailures: 3, maxRetriesPerItem: 1)

        test("网络不可达时保持当前画面，绝不拉黑") {
            // 这是最关键的一条：断网时若拉黑，一次网络波动会把整池好资源丢进黑名单
            expectEqual(
                policy.action(for: .networkUnreachable, networkReachable: false, consecutiveFailures: 1, retriesForItem: 0),
                .holdCurrent, "断网 → 保持画面"
            )
            // 即使错误被归类成资源失效，只要网络不可达，也不拉黑
            expectEqual(
                policy.action(for: .resourceGone(status: 404), networkReachable: false, consecutiveFailures: 1, retriesForItem: 0),
                .holdCurrent, "网络不可达时资源类错误也不拉黑"
            )
        }

        test("连续失败达阈值时优先停止调度") {
            expectEqual(
                policy.action(for: .resourceGone(status: 404), networkReachable: true, consecutiveFailures: 3, retriesForItem: 0),
                .stopScheduling, "已达阈值 → 停止"
            )
            expectEqual(
                policy.action(for: .networkUnreachable, networkReachable: false, consecutiveFailures: 5, retriesForItem: 0),
                .stopScheduling, "阈值优先于断网判定"
            )
            expectEqual(
                policy.action(for: .transientNetwork("t"), networkReachable: true, consecutiveFailures: 3, retriesForItem: 0),
                .stopScheduling, "阈值优先于重试判定"
            )
        }

        test("临时网络故障在有重试额度时重试同一条") {
            expectEqual(
                policy.action(for: .transientNetwork("timeout"), networkReachable: true, consecutiveFailures: 1, retriesForItem: 0),
                .retrySame, "首次超时应重试"
            )
            expectEqual(
                policy.action(for: .transientNetwork("timeout"), networkReachable: true, consecutiveFailures: 2, retriesForItem: 1),
                .blacklistAndAdvance, "重试额度用尽则拉黑换下一条"
            )
        }

        test("服务端错误与未知错误也给一次重试") {
            expectEqual(
                policy.action(for: .serverError(status: 503), networkReachable: true, consecutiveFailures: 1, retriesForItem: 0),
                .retrySame, "5xx 应重试"
            )
            expectEqual(
                policy.action(for: .unknown("?"), networkReachable: true, consecutiveFailures: 1, retriesForItem: 0),
                .retrySame, "未知错误应重试"
            )
            expectEqual(
                policy.action(for: .serverError(status: 503), networkReachable: true, consecutiveFailures: 2, retriesForItem: 1),
                .blacklistAndAdvance, "5xx 重试用尽则拉黑"
            )
        }

        test("资源失效与不可解码直接拉黑，不浪费重试") {
            expectEqual(
                policy.action(for: .resourceGone(status: 404), networkReachable: true, consecutiveFailures: 1, retriesForItem: 0),
                .blacklistAndAdvance, "404 直接拉黑"
            )
            expectEqual(
                policy.action(for: .resourceGone(status: 403), networkReachable: true, consecutiveFailures: 1, retriesForItem: 0),
                .blacklistAndAdvance, "403 直接拉黑"
            )
            expectEqual(
                policy.action(for: .notPlayable("av01"), networkReachable: true, consecutiveFailures: 1, retriesForItem: 0),
                .blacklistAndAdvance, "不可解码直接拉黑"
            )
        }

        test("maxRetriesPerItem 为 0 时所有错误都直接拉黑或保持") {
            let noRetry = FailurePolicy(maxConsecutiveFailures: 3, maxRetriesPerItem: 0)
            expectEqual(
                noRetry.action(for: .transientNetwork("t"), networkReachable: true, consecutiveFailures: 1, retriesForItem: 0),
                .blacklistAndAdvance, "不允许重试时超时也拉黑"
            )
            expectEqual(
                noRetry.action(for: .networkUnreachable, networkReachable: false, consecutiveFailures: 1, retriesForItem: 0),
                .holdCurrent, "断网仍保持画面"
            )
        }

        test("穷举：任何组合都不会返回「未知」之外的东西，且断网永不拉黑") {
            let kinds: [PlaybackFailureKind] = [
                .networkUnreachable,
                .transientNetwork("t"),
                .resourceGone(status: 404),
                .serverError(status: 503),
                .notPlayable("x"),
                .unknown("?"),
            ]
            var holdCount = 0
            var blacklistCount = 0
            for kind in kinds {
                for failures in 1...4 {
                    for retries in 0...2 {
                        for reachable in [true, false] {
                            let action = policy.action(
                                for: kind,
                                networkReachable: reachable,
                                consecutiveFailures: failures,
                                retriesForItem: retries
                            )
                            // 断网且未达阈值时，永远不能拉黑
                            if !reachable && failures < 3 {
                                expect(action == .holdCurrent,
                                       "断网时 \(kind.label) failures=\(failures) retries=\(retries) 应保持画面，实际 \(action)")
                            }
                            if action == .holdCurrent { holdCount += 1 }
                            if action == .blacklistAndAdvance { blacklistCount += 1 }
                        }
                    }
                }
            }
            expect(holdCount > 0, "应出现过保持画面，实际 \(holdCount) 次")
            expect(blacklistCount > 0, "应出现过拉黑，实际 \(blacklistCount) 次")
        }
    }
}
