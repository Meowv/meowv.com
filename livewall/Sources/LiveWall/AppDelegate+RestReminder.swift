import AppKit
import AVFoundation
import CoreGraphics
import LiveWallCore

extension AppDelegate {

    // MARK: - 休息提醒时钟

    func startRestReminderClock() {
        restReminderTimer?.invalidate()
        restReminderTimer = nil
        let now = ProcessInfo.processInfo.systemUptime
        restReminderLastTickUptime = now
        restReminderActivityUntilUptime = now + RestReminderClock.inactivityTimeoutSeconds
        guard preferences.restReminderEnabled else {
            restReminderClock.reset()
            return
        }

        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tickRestReminderClock() }
        }
        RunLoop.main.add(timer, forMode: .common)
        restReminderTimer = timer
    }

    func stopRestReminderClock() {
        restReminderTimer?.invalidate()
        restReminderTimer = nil
        restReminderClock.reset()
        restReminderLastTickUptime = ProcessInfo.processInfo.systemUptime
    }

    /// 用户打开菜单或浏览窗口属于一次明确的活跃操作。
    func recordRestReminderActivity() {
        let now = ProcessInfo.processInfo.systemUptime
        restReminderLastTickUptime = now
        restReminderActivityUntilUptime = now + RestReminderClock.inactivityTimeoutSeconds
        tryStartDueRestReminder()
    }

    private func tickRestReminderClock() {
        let now = ProcessInfo.processInfo.systemUptime
        // 主线程短暂繁忙或机器刚唤醒时不把整段停顿算成活跃使用时间。
        let elapsed = min(2, max(0, now - restReminderLastTickUptime))
        restReminderLastTickUptime = now

        guard preferences.restReminderEnabled else { return }
        guard !restReminderCoordinator.isActive else { return }

        let signals = governor.signals
        let canAccumulate = !signals.sessionLocked
            && !signals.displaySleeping
            && (now < restReminderActivityUntilUptime
                || Self.systemIdleSecondsForRestReminder() < RestReminderClock.inactivityTimeoutSeconds)
        _ = restReminderClock.advance(
            by: elapsed,
            intervalSeconds: preferences.restIntervalSeconds,
            enabled: true,
            canAccumulate: canAccumulate
        )
        tryStartDueRestReminder()
    }

    func tryStartDueRestReminder(force: Bool = false) {
        guard (force || preferences.restReminderEnabled),
              restReminderClock.isDue,
              !restReminderCoordinator.isActive,
              !governor.signals.sessionLocked,
              !governor.signals.displaySleeping,
              governor.state.isPlaying,
              let primary = engine.primaryKey,
              let primaryPlayer = engine.player(on: primary),
              primaryPlayer.rate > 0
        else { return }

        let players = restReminderPlayersByDisplayID()
        guard restReminderCoordinator.start(
            durationSeconds: RestReminderDuration.clamp(preferences.restDurationSeconds),
            playersByDisplayID: players
        ) else { return }

        restReminderClock.markRestStarted()
        governor.setResting(true)
        log(
            "休息提醒开始：时长 \(RestReminderDuration.label(preferences.restDurationSeconds))，"
                + "覆盖屏幕 \(players.count) 块"
        )
    }

    func completeRestReminder(reason: RestReminderEndReason) {
        governor.setResting(false)
        restReminderClock.reset()
        restReminderLastTickUptime = ProcessInfo.processInfo.systemUptime
        switch reason {
        case .user:
            log("用户提前结束休息提醒，开始新一轮活跃时间累计")
        case .countdown:
            log("休息提醒倒计时结束，开始新一轮活跃时间累计")
        }
        refreshStatusItem()
    }

    /// 系统锁屏 / 息屏会暂停休息倒计时并隐藏覆盖层，避免遮住系统安全界面。
    func syncRestReminderInterruptionState() {
        let interrupted = governor.signals.sessionLocked || governor.signals.displaySleeping
        if interrupted {
            restReminderCoordinator.pauseForSystemInterruption()
        } else {
            restReminderCoordinator.resumeAfterSystemInterruption()
            tryStartDueRestReminder()
        }
    }

    /// 按每屏当前播放槽位构造播放器映射。没有独立槽位的屏幕回退到主槽位。
    func restReminderPlayersByDisplayID() -> [UInt32: AVPlayer] {
        guard let primary = engine.primaryKey,
              let primaryPlayer = engine.player(on: primary) else { return [:] }

        var result: [UInt32: AVPlayer] = [:]
        for screen in NSScreen.screens {
            guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
            else { continue }
            let displayID = number.uint32Value

            let key: PlaybackSlotKey
            if screenCoordinator.policy == .perScreen,
               let group = screenCoordinator.slotPlan.slots.first(where: {
                   $0.contains(where: { $0.displayID == displayID })
               }),
               let first = group.first {
                key = .display(first.displayID)
            } else {
                key = primary
            }
            result[displayID] = engine.player(on: key) ?? primaryPlayer
        }
        return result
    }

    func refreshRestReminderPlayers() {
        guard restReminderCoordinator.isActive else {
            tryStartDueRestReminder()
            return
        }
        restReminderCoordinator.refresh(playersByDisplayID: restReminderPlayersByDisplayID())
    }

    private static func systemIdleSecondsForRestReminder() -> Double {
        guard let anyEvent = CGEventType(rawValue: ~0) else { return 0 }
        let seconds = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: anyEvent)
        return seconds.isFinite && seconds >= 0 ? seconds : 0
    }

    // MARK: - 菜单动作

    func buildRestReminderMenu() -> NSMenuItem {
        let submenu = NSMenu()

        let toggle = NSMenuItem(
            title: "启用休息提醒（\(preferences.restReminderEnabled ? "开" : "关")）",
            action: #selector(toggleRestReminder(_:)),
            keyEquivalent: ""
        )
        toggle.target = self
        toggle.state = preferences.restReminderEnabled ? .on : .off
        submenu.addItem(toggle)
        submenu.addItem(.separator())

        let intervalMenu = NSMenu()
        for seconds in RestReminderInterval.presets {
            let item = NSMenuItem(
                title: RestReminderInterval.label(seconds),
                action: #selector(setRestReminderInterval(_:)),
                keyEquivalent: ""
            )
            item.target = self
            item.representedObject = seconds
            item.state = abs(preferences.restIntervalSeconds - seconds) < 0.5 ? .on : .off
            intervalMenu.addItem(item)
        }
        let intervalRoot = NSMenuItem(
            title: "休息间隔（\(RestReminderInterval.label(preferences.restIntervalSeconds))）",
            action: nil,
            keyEquivalent: ""
        )
        intervalRoot.submenu = intervalMenu
        submenu.addItem(intervalRoot)

        let durationMenu = NSMenu()
        for seconds in RestReminderDuration.presets {
            let item = NSMenuItem(
                title: RestReminderDuration.label(seconds),
                action: #selector(setRestReminderDuration(_:)),
                keyEquivalent: ""
            )
            item.target = self
            item.representedObject = seconds
            item.state = abs(preferences.restDurationSeconds - seconds) < 0.5 ? .on : .off
            durationMenu.addItem(item)
        }
        let durationRoot = NSMenuItem(
            title: "休息时长（\(RestReminderDuration.label(preferences.restDurationSeconds))）",
            action: nil,
            keyEquivalent: ""
        )
        durationRoot.submenu = durationMenu
        submenu.addItem(durationRoot)

        let root = NSMenuItem(
            title: "休息提醒（\(preferences.restReminderEnabled ? "开" : "关")）",
            action: nil,
            keyEquivalent: ""
        )
        root.submenu = submenu
        return root
    }

    @objc func toggleRestReminder(_ sender: NSMenuItem) {
        preferences.restReminderEnabled.toggle()
        persistPreferences("休息提醒开关")
        if preferences.restReminderEnabled {
            startRestReminderClock()
            log("休息提醒已开启：每 \(RestReminderInterval.label(preferences.restIntervalSeconds))")
        } else {
            stopRestReminderClock()
            restReminderCoordinator.end(reason: .user)
            if governor.signals.resting { governor.setResting(false) }
            log("休息提醒已关闭")
        }
        refreshStatusItem()
    }

    @objc func setRestReminderInterval(_ sender: NSMenuItem) {
        guard let seconds = sender.representedObject as? Double else { return }
        preferences.restIntervalSeconds = RestReminderInterval.clamp(seconds)
        persistPreferences("休息间隔")
        log("休息间隔改为 \(RestReminderInterval.label(preferences.restIntervalSeconds))")
        tickRestReminderClock()
        refreshStatusItem()
    }

    @objc func setRestReminderDuration(_ sender: NSMenuItem) {
        guard let seconds = sender.representedObject as? Double else { return }
        preferences.restDurationSeconds = RestReminderDuration.clamp(seconds)
        persistPreferences("休息时长")
        log("休息时长改为 \(RestReminderDuration.label(preferences.restDurationSeconds))")
        refreshStatusItem()
    }

    var canStartRestReminderNow: Bool {
        guard !restReminderCoordinator.isActive,
              governor.state.isPlaying,
              let primary = engine.primaryKey,
              let player = engine.player(on: primary)
        else { return false }
        return player.rate > 0
    }

    @objc func startRestReminderNow() {
        guard canStartRestReminderNow else { return }
        restReminderClock = RestReminderClock(isDue: true)
        tryStartDueRestReminder(force: true)
        if !restReminderCoordinator.isActive {
            log("立即开始休息未能启动：当前没有正在播放的视频")
        }
    }
}
