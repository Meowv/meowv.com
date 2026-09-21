import Foundation
import LiveWallCore

/// 单实例判定（`SingleInstance` / `InstanceLock`）。
///
/// 这组测试能覆盖到「机制」本身：`flock` 的冲突与释放都能在**同一个进程内**用两个
/// 独立 fd 验证（flock 是 per-open-file-description，同进程不同 fd 同样互斥）。
/// 覆盖不到的是「真实双进程启动」—— 那要起两次 App，见 README 的验证小节。
func singleInstanceTests() {
    suite("单实例：身份与路径") {

        test("bundle id 优先，裸二进制退回可执行文件名") {
            expectEqual(
                SingleInstance.identity(bundleIdentifier: "com.meowv.livewall", executableName: "LiveWall"),
                "com.meowv.livewall",
                "有 bundle id 时用它 —— dev 版与打包版同 id，本来就该互斥"
            )
            expectEqual(
                SingleInstance.identity(bundleIdentifier: nil, executableName: "LiveWall"),
                "exe-LiveWall",
                "没有 bundle（裸跑 .build 里的二进制）时退回可执行文件名"
            )
            expectEqual(
                SingleInstance.identity(bundleIdentifier: "   ", executableName: "LiveWall"),
                "exe-LiveWall",
                "空白串等同于没有"
            )
        }

        test("锁文件按身份分文件，且名字里不留路径分隔符") {
            let dir = URL(fileURLWithPath: "/tmp/livewall-paths")
            expectEqual(
                SingleInstance.lockFileURL(directory: dir, identity: "com.meowv.livewall").lastPathComponent,
                "instance-com.meowv.livewall.lock",
                "正常身份"
            )
            expectEqual(
                SingleInstance.lockFileURL(directory: dir, identity: "a/b").lastPathComponent,
                "instance-a_b.lock",
                "身份里的斜杠要替掉，否则会写到别的目录去"
            )
        }

        test("豁免只认明确的真值") {
            let key = SingleInstance.allowMultipleEnvKey
            for value in ["1", "true", "TRUE", "yes", "on", " 1 "] {
                expect(
                    SingleInstance.allowsMultiple(environment: [key: value]),
                    "\(value) 应当算豁免"
                )
            }
            for value in ["0", "false", "no", "", "  "] {
                expect(
                    !SingleInstance.allowsMultiple(environment: [key: value]),
                    "「\(value)」不该算豁免（设了但写错不该意外打开多实例）"
                )
            }
            expect(!SingleInstance.allowsMultiple(environment: [:]), "没设环境变量时不豁免")
        }

        test("持有者信息整理成人读形式") {
            expectEqual(
                SingleInstance.describeHolder("pid=1234\npath=/Applications/LiveWall.app\n"),
                "pid 1234（/Applications/LiveWall.app）",
                "pid 与路径都有"
            )
            expectEqual(SingleInstance.describeHolder("pid=1234\n"), "pid 1234", "只有 pid")
            expectEqual(SingleInstance.describeHolder("path=/x/y\n"), "/x/y", "只有路径")
            expectNil(SingleInstance.describeHolder(""), "空内容不给提示")
            expectNil(SingleInstance.describeHolder(nil), "读不到不给提示")
            expectNil(SingleInstance.describeHolder("乱码"), "解析不出就不提示，不该报错")
        }
    }

    suite("单实例：锁本身") {

        test("第一个拿到锁，第二个被挡且能说出占用者") {
            withTempDirectory { dir in
                let url = dir.appendingPathComponent("instance.lock")
                guard let first = try? InstanceLock.acquire(at: url) else {
                    expect(false, "第一次取锁应当成功")
                    return
                }
                expect(FileManager.default.fileExists(atPath: url.path), "锁文件应当被创建")

                do {
                    _ = try InstanceLock.acquire(at: url)
                    expect(false, "第二次取锁应当失败")
                } catch let error as InstanceLock.AcquireError {
                    guard case .alreadyRunning(let holder) = error else {
                        expect(false, "应当是 alreadyRunning，实际 \(error)")
                        return
                    }
                    let described = SingleInstance.describeHolder(holder) ?? ""
                    expect(
                        described.contains("pid \(getpid())"),
                        "占用者信息里应当是本进程的 pid（实际：\(described)）"
                    )
                } catch {
                    expect(false, "错误类型不对：\(error)")
                }

                // 释放之后应当能重新拿到 —— 这条是「没有 stale 锁」的最小证据。
                first.release()
                expectNotNil(try? InstanceLock.acquire(at: url), "放锁之后应当能重新取到")
            }
        }

        test("锁不可用时不抛 alreadyRunning，而是给出可读原因") {
            withTempDirectory { dir in
                // 让锁文件的父目录是一个**普通文件**：建目录与 open 都会失败。
                let blocker = dir.appendingPathComponent("blocker")
                try? Data("x".utf8).write(to: blocker)
                let url = blocker.appendingPathComponent("instance.lock")
                do {
                    _ = try InstanceLock.acquire(at: url)
                    expect(false, "应当抛 unavailable")
                } catch let error as InstanceLock.AcquireError {
                    guard case .unavailable(let reason) = error else {
                        expect(false, "应当是 unavailable，实际 \(error)")
                        return
                    }
                    expect(reason.contains("instance.lock"), "原因里应带上路径：\(reason)")
                } catch {
                    expect(false, "错误类型不对：\(error)")
                }
            }
        }

        test("目录不存在时会自动建出来") {
            withTempDirectory { dir in
                let nested = dir.appendingPathComponent("不存在的子目录", isDirectory: true)
                let url = nested.appendingPathComponent("instance.lock")
                expectNotNil(try? InstanceLock.acquire(at: url), "应当能取到锁（目录自动创建）")
                expect(
                    FileManager.default.fileExists(atPath: nested.path),
                    "父目录应当被创建 —— 全新安装时它还不存在"
                )
            }
        }
    }

    suite("日志落盘的公共部分") {

        test("时间戳格式固定为 MM-dd HH:mm:ss.SSS") {
            let stamp = AppLog.stamp(for: Date(timeIntervalSince1970: 1_760_000_000))
            expectEqual(stamp.count, "09-21 08:49:37.951".count, "长度应与格式一致（实际：\(stamp)）")
            expect(stamp.contains(" "), "日期与时间之间是空格")
            expect(stamp.hasSuffix(".") == false, "末尾不该是点")
            let parts = stamp.split(separator: ".")
            expectEqual(parts.count, 2, "应当只有一个小数点分隔毫秒")
            expectEqual(parts.last?.count, 3, "毫秒应是三位")
        }

        test("追加一行：文件不存在时创建，存在时追加不覆盖") {
            withTempDirectory { dir in
                let file = dir.appendingPathComponent("logs/livewall.log")
                AppLog.append("第一行", to: file)
                AppLog.append("第二行", to: file)
                let content = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
                expect(content.contains("第一行"), "第一行应在（同时验证目录被创建）")
                expect(content.contains("第二行"), "第二行应在")
                expectEqual(content.split(separator: "\n").count, 2, "应当是两行，不是覆盖成一行")
                expect(content.hasSuffix("\n"), "每行末尾带换行")
            }
        }
    }
}

/// 建一个临时目录，跑完删掉。锁与日志都要真落盘，不能用假路径。
private func withTempDirectory(_ body: (URL) throws -> Void) {
    let root = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("livewall-single-instance-\(UUID().uuidString)", isDirectory: true)
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    do {
        try body(root)
    } catch {
        expect(false, "临时目录用例抛出意外错误：\(error)")
    }
}
