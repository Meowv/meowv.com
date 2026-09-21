import Foundation
import LiveWallCore

/// 可控的 `URLProtocol` 桩：按脚本给出响应 / 延迟 / 记录是否被取消。
///
/// 这是 `SynchronousFetch` 存在的第二个理由的兑现 —— 原实现把 `URLSession.shared`
/// 写死在函数体里，于是「超时竞态 + 任务不取消」这条缺陷**结构上不可测**。
/// 有了会话注入点，下面这些断言才写得出来。
///
/// **`@unchecked Sendable` 是刻意的**：`URLProtocol` 本身不是 `Sendable`，
/// 而我们的 `DispatchQueue.asyncAfter` 闭包是 `@Sendable` —— 不声明就被 Swift 6 判为
/// 「捕获非 Sendable 的 self」。声明成立的前提是 `URLProtocol` 的既定契约：
/// 它的实例只由 URLSession 在「这个请求自己的加载线程」上驱动，同一实例不会被并发访问。
/// 这里接受的是 Foundation 的那份契约，不是「并发安全无所谓」。
final class StubProtocol: URLProtocol, @unchecked Sendable {

    struct Behavior {
        var statusCode: Int = 200
        var body: Data = Data("ok".utf8)
        /// 延迟多久才交付响应 —— 用来触发超时路径。
        var delay: TimeInterval = 0
        /// 让 URLSession 层直接失败（模拟 DNS / 连接错误）。
        var failWithError: Error?
    }

    /// 当前行为。测试是串行的，用静态变量即可（不引入锁，保持桩本身简单）。
    ///
    /// `nonisolated(unsafe)` 是显式标记：`swift-tools-version` 升到 6.0 时
    /// Swift 6 语言模式会把这些全局可变状态报为错误，而这个「测试串行」的前提
    /// 是这里能给出的最强保证。
    nonisolated(unsafe) static var behavior = Behavior()
    /// `stopLoading()` 是否被调用过 —— 即 URLSession 取消了这次任务。
    nonisolated(unsafe) static var didCancel = false

    static func reset(statusCode: Int = 200, body: Data = Data("ok".utf8),
                      delay: TimeInterval = 0, failWithError: Error? = nil) {
        behavior = Behavior(statusCode: statusCode, body: body, delay: delay,
                            failWithError: failWithError)
        didCancel = false
    }

    /// 造一个只走桩的会话。
    static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: config)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let behavior = Self.behavior
        // 一律异步交付：`startLoading` 里同步回调在某些 URLSession 版本上会被丢掉。
        DispatchQueue.global().asyncAfter(deadline: .now() + behavior.delay) { [weak self] in
            guard let self else { return }
            if let error = behavior.failWithError {
                self.client?.urlProtocol(self, didFailWithError: error)
                return
            }
            guard let url = self.request.url,
                  let response = HTTPURLResponse(
                      url: url, statusCode: behavior.statusCode,
                      httpVersion: "HTTP/1.1", headerFields: nil)
            else {
                self.client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
                return
            }
            self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            if !behavior.body.isEmpty {
                self.client?.urlProtocol(self, didLoad: behavior.body)
            }
            self.client?.urlProtocolDidFinishLoading(self)
        }
    }

    override func stopLoading() {
        Self.didCancel = true
    }
}

/// 等一个条件成立（最多 `timeout` 秒）。取消是**异步**落到 URLProtocol 上的，
/// 不能读完就立刻断言。
private func waitUntil(_ condition: () -> Bool, timeout: TimeInterval = 1) {
    let deadline = Date().addingTimeInterval(timeout)
    while !condition() && Date() < deadline {
        usleep(5_000)
    }
}

func synchronousFetchTests() {
    suite("同步取数（SynchronousFetch）") {

        let url = URL(string: "https://stub.test/a")!

        test("200 + 正文 → 返回数据（同时证明会话可注入）") {
            StubProtocol.reset(statusCode: 200, body: Data("hello".utf8))
            let data = try? SynchronousFetch.data(from: url, session: StubProtocol.makeSession())
            expectEqual(data, Data("hello".utf8), "应返回正文")
        }

        test("非 2xx → 抛 .httpStatus，且带上状态码") {
            StubProtocol.reset(statusCode: 404)
            do {
                _ = try SynchronousFetch.data(from: url, session: StubProtocol.makeSession())
                expect(false, "404 不该成功")
            } catch let failure as SynchronousFetch.Failure {
                expectEqual(failure, .httpStatus(404), "应判为 404")
                expectEqual(failure.errorDescription, "HTTP 404", "错误描述要能直接进日志")
            } catch {
                expect(false, "错误类型不符：\(error)")
            }
        }

        test("正文为空 → 抛 .emptyResponse（空响应不能当成有效数据）") {
            StubProtocol.reset(statusCode: 200, body: Data())
            do {
                _ = try SynchronousFetch.data(from: url, session: StubProtocol.makeSession())
                expect(false, "空正文不该成功")
            } catch let failure as SynchronousFetch.Failure {
                expectEqual(failure, .emptyResponse, "应判为空响应")
            } catch {
                expect(false, "错误类型不符：\(error)")
            }
        }

        test("传输层错误 → 抛 .transport，并保留原始描述") {
            StubProtocol.reset(failWithError: URLError(.cannotFindHost))
            do {
                _ = try SynchronousFetch.data(from: url, session: StubProtocol.makeSession())
                expect(false, "传输错误不该成功")
            } catch let failure as SynchronousFetch.Failure {
                guard case .transport(let detail) = failure else {
                    expect(false, "应为 .transport，实际 \(failure)")
                    return
                }
                expect(!detail.isEmpty, "原始描述不该丢（排障唯一线索）")
            } catch {
                expect(false, "错误类型不符：\(error)")
            }
        }

        test("等待上限到期 → 抛 .timedOut，**且任务被取消**（不是放任它跑完）") {
            // 这条是这个类型存在的理由。原实现超时后既不 cancel 也不释放，
            // 那个请求会继续跑完、白占一个连接与一份内存。
            //
            // ⚠️ 必须把 `timeout` 设得**远大于** `maximumWait`：URLRequest 自己的
            // timeoutInterval 会先触发，那时 URLSession 自己就会报错并收尾 ——
            // 那样测的就不是「我们的等待上限 + 取消」，而是 URLSession 的行为。
            StubProtocol.reset(statusCode: 200, body: Data("late".utf8), delay: 0.5)
            do {
                _ = try SynchronousFetch.data(
                    from: url,
                    timeout: 60,
                    maximumWait: 0.1,
                    session: StubProtocol.makeSession()
                )
                expect(false, "应当超时抛错")
            } catch let failure as SynchronousFetch.Failure {
                expectEqual(failure, .timedOut, "应判为「我们的等待上限到期」")
            } catch {
                expect(false, "错误类型不符：\(error)")
            }

            waitUntil { StubProtocol.didCancel }
            expect(StubProtocol.didCancel, "超时必须取消任务 —— 否则它继续跑完，白占连接与内存")
        }

        test("URLRequest 自己的超时先触发时，归类为 .transport 并保留原始描述") {
            // 生产路径上这一条才是常态：`timeout` 15 秒 / 等待上限 20 秒，
            // 所以 URLSession 通常先报超时。`.timedOut` 是**安全网**
            // （URLSession 没兑现自己的 timeoutInterval 时兜底），不是主路径。
            StubProtocol.reset(statusCode: 200, body: Data("late".utf8), delay: 0.5)
            do {
                _ = try SynchronousFetch.data(
                    from: url,
                    timeout: 0.05,
                    maximumWait: 60,
                    session: StubProtocol.makeSession()
                )
                expect(false, "应当抛错")
            } catch let failure as SynchronousFetch.Failure {
                guard case .transport(let detail) = failure else {
                    expect(false, "应为 .transport，实际 \(failure)")
                    return
                }
                expect(!detail.isEmpty, "原始描述不该丢（排障唯一线索）")
            } catch {
                expect(false, "错误类型不符：\(error)")
            }
        }
    }
}
