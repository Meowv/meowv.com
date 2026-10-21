using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using Meowv.Api.Modules.XiaomiCamera.Protocol;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>
/// 将小米私有媒体帧转成浏览器通用的 H.264 HLS。
/// 摄像头上游会话与 FFmpeg 进程按设备共享；HLS 分片只存在于临时目录。
/// </summary>
public sealed class XiaomiHlsService : IDisposable, IAsyncDisposable
{
    private static readonly TimeSpan PreparationTimeout = TimeSpan.FromSeconds(90);
    private const double InitialPlaylistBufferSeconds = 6;
    private const int MinimumInitialSegments = 3;
    private readonly ConcurrentDictionary<string, HlsState> _states = new(StringComparer.Ordinal);
    private readonly HashSet<HlsState> _activeStates = [];

    private readonly Lock _lifecycleGate = new();
    private readonly XiaomiLiveStreamService _streams;
    private readonly XiaomiFfmpegResolver _ffmpeg;
    private readonly XiaomiCameraOptions _options;
    private readonly ILogger<XiaomiHlsService> _logger;
    private readonly XiaomiCredentialCache _credentialCache;
    private readonly XiaomiPlaybackLimits _limits;
    private bool _disposed;

    public XiaomiHlsService(XiaomiLiveStreamService streams, XiaomiFfmpegResolver ffmpeg, XiaomiCameraOptions options, ILogger<XiaomiHlsService> logger, XiaomiCredentialCache credentialCache, XiaomiPlaybackLimits limits)
    {
        _streams = streams;
        _ffmpeg = ffmpeg;
        _options = options;
        _logger = logger;
        _credentialCache = credentialCache;
        _limits = limits;
        credentialCache.SessionChanged += StopOlderSessions;
    }

    public XiaomiPlaybackTarget? Start(string fingerprint, long sessionVersion)
    {
        lock (_lifecycleGate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (sessionVersion != _credentialCache.GetSessionVersion()) return null;
            if (!_states.TryGetValue(fingerprint, out var state) ||
                state.Target.SessionVersion != sessionVersion || !state.CanAcceptRequests)
            {
                state?.Stop();
                // 包含正在回收的旧会话；其上游和转码器释放后才归还容量。
                if (_activeStates.Count >= _limits.MaxConcurrentStreams) throw new XiaomiPlaybackCapacityException();
                state = new HlsState(new XiaomiPlaybackTarget(fingerprint, sessionVersion, Guid.NewGuid()), _options.MediaProfile, _logger, _options.TempDirectory);
                _states[fingerprint] = state;
                _activeStates.Add(state);
            }

            state.Touch();
            var startedState = state;
            try
            {
                state.StartOnce(() => PumpAsync(startedState));
            }
            catch
            {
                _activeStates.Remove(state);
                _states.TryRemove(new KeyValuePair<string, HlsState>(fingerprint, state));
                state.Stop();
                throw;
            }

            return state.Target;
        }
    }

    public bool IsCurrent(XiaomiPlaybackTarget target) => FindState(target) is not null;

    private HlsState? FindState(XiaomiPlaybackTarget target) =>
        target.SessionVersion == _credentialCache.GetSessionVersion() &&
        _states.TryGetValue(target.DeviceFingerprint, out var state) && state.Target == target
            ? state
            : null;

    /// <summary>只读取票据绑定的媒体会话，失败后由客户端申请新票据重建。</summary>
    public Task<string> WaitForPlaylistAsync(XiaomiPlaybackTarget target, CancellationToken cancellationToken)
    {
        var state = FindState(target) ?? throw new XiaomiPlaybackException("播放会话已停止。", false);
        return state.WaitForPlaylistAsync(cancellationToken);
    }

    public string? SegmentPath(XiaomiPlaybackTarget target, string name)
    {
        var state = FindState(target);
        if (state is null) return null;
        state.Touch();
        return state.GetSegmentPath(name);
    }

    public XiaomiPlaybackPreparation GetPreparation(XiaomiPlaybackTarget target)
    {
        var state = FindState(target);
        if (state is null) return XiaomiPlaybackPreparation.Stopped;
        state.Touch();
        return state.GetPreparation();
    }

    public async Task<XiaomiMotorStepResult> MotorStepAsync(string fingerprint, int operation, CancellationToken cancellationToken)
    {
        if (!_states.TryGetValue(fingerprint, out var state) ||
            state.Target.SessionVersion != _credentialCache.GetSessionVersion())
        {
            return XiaomiMotorStepResult.NoSession;
        }

        return await state.MotorStepAsync(operation, cancellationToken);
    }

    private void StopOlderSessions(long version)
    {
        lock (_lifecycleGate)
        {
            foreach (var (fingerprint, state) in _states)
            {
                // 保存通知可能交错到达，旧通知不能停止更新的登录会话。
                if (state.Target.SessionVersion >= version) continue;
                state.Stop();
                _states.TryRemove(new KeyValuePair<string, HlsState>(fingerprint, state));
            }
        }
    }

    public void Dispose()
    {
        lock (_lifecycleGate)
        {
            if (_disposed) return;
            _disposed = true;
            _credentialCache.SessionChanged -= StopOlderSessions;
            foreach (var state in _activeStates) state.Stop();
            _states.Clear();
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        Task[] completions;
        lock (_lifecycleGate)
        {
            Dispose();
            completions = _activeStates.Select(state => state.Completion).ToArray();
        }

        await Task.WhenAll(completions).WaitAsync(cancellationToken);
    }

    public async ValueTask DisposeAsync() => await StopAsync(CancellationToken.None);

    private async Task PumpAsync(HlsState state)
    {
        try
        {
            await using var stream = await _streams.OpenAsync(state.Fingerprint, state.Target.SessionVersion, state.Stopping.Token);
            state.AttachStream(stream);
            try
            {
                await state.TranscodeAsync(stream, _ffmpeg.ExecutablePath, state.Stopping.Token);
            }
            finally
            {
                state.DetachStream(stream);
            }
        }
        catch (OperationCanceledException) when (state.Stopping.IsCancellationRequested)
        {
            // 无观看者时回收临时会话。
        }
        catch (XiaomiLiveStreamException exception)
        {
            state.Fail(exception.Message);
        }
        catch (Exception exception)
        {
            // 不将进程参数、媒体内容或连接材料写入日志或 API 响应。
            _logger.LogWarning("HLS 会话失败，错误类型 {ExceptionType}", exception.GetType().Name);
            state.Fail("无法建立 H.264 浏览器播放流。");
        }
        finally
        {
            state.Finish();
            try
            {
                await state.CompleteCleanupAsync();
            }
            finally
            {
                lock (_lifecycleGate) _activeStates.Remove(state);
            }
        }
    }

    private sealed class HlsState(XiaomiPlaybackTarget target, XiaomiMediaProfile profile, ILogger logger, string tempDirectory)
    {
        private static readonly TimeSpan IdleTimeout = TimeSpan.FromSeconds(30);
        private readonly Lock _gate = new();
        private readonly string _directory = Path.Combine(tempDirectory, "xiaomi-camera-gateway-hls", $"{target.DeviceFingerprint}-{target.StreamId:N}");
        private Task? _pump;
        private Task? _idleCleanup;
        private Process? ffmpeg;
        private XiaomiLiveStream? _liveStream;
        private DateTimeOffset _lastMotorStep = DateTimeOffset.MinValue;
        private readonly SemaphoreSlim _motorLock = new(1, 1);
        private bool _finished;
        private string _status = "preparing";
        private string? _failure;
        private bool _audioAvailable;
        private readonly Stopwatch _sessionClock = Stopwatch.StartNew();

        public XiaomiPlaybackTarget Target { get; } = target;
        public string Fingerprint => Target.DeviceFingerprint;
        public CancellationTokenSource Stopping { get; } = new();

        public Task Completion
        {
            get
            {
                lock (_gate) return Task.WhenAll(_pump ?? Task.CompletedTask, _idleCleanup ?? Task.CompletedTask);
            }
        }

        private DateTimeOffset LastAccess { get; set; } = DateTimeOffset.UtcNow;

        public bool CanAcceptRequests
        {
            get
            {
                lock (_gate)
                {
                    return !_finished && !Stopping.IsCancellationRequested;
                }
            }
        }

        public void AttachStream(XiaomiLiveStream stream)
        {
            lock (_gate)
            {
                _liveStream = stream;
            }
        }

        public void DetachStream(XiaomiLiveStream stream)
        {
            lock (_gate)
            {
                if (ReferenceEquals(_liveStream, stream)) _liveStream = null;
            }
        }

        public async Task<XiaomiMotorStepResult> MotorStepAsync(int operation, CancellationToken cancellationToken)
        {
            if (!await _motorLock.WaitAsync(0, cancellationToken))
            {
                return XiaomiMotorStepResult.TooFrequent;
            }

            try
            {
                XiaomiLiveStream? stream;
                lock (_gate)
                {
                    stream = _status == "ready" && !Stopping.IsCancellationRequested ? _liveStream : null;
                    if (stream is null) return XiaomiMotorStepResult.NoSession;
                    if (DateTimeOffset.UtcNow - _lastMotorStep < TimeSpan.FromSeconds(1))
                    {
                        return XiaomiMotorStepResult.TooFrequent;
                    }
                }

                if (!string.Equals(stream.Model, "chuangmi.camera.079ac1", StringComparison.Ordinal))
                {
                    return XiaomiMotorStepResult.UnsupportedModel;
                }

                try
                {
                    await stream.MotorStepAsync(operation, cancellationToken);
                }
                catch (OperationCanceledException) when (Stopping.IsCancellationRequested)
                {
                    return XiaomiMotorStepResult.NoSession;
                }

                lock (_gate)
                {
                    _lastMotorStep = DateTimeOffset.UtcNow;
                }

                return XiaomiMotorStepResult.Sent;
            }
            finally
            {
                _motorLock.Release();
            }
        }

        public void Stop()
        {
            lock (_gate)
            {
                _status = "stopped";
            }

            Stopping.Cancel();
        }

        public async Task CompleteCleanupAsync()
        {
            await Stopping.CancelAsync();
            Task? cleanup;
            lock (_gate) cleanup = _idleCleanup;
            if (cleanup is not null) await cleanup;
        }

        public void Touch()
        {
            lock (_gate)
            {
                LastAccess = DateTimeOffset.UtcNow;
            }
        }

        public XiaomiPlaybackPreparation GetPreparation()
        {
            lock (_gate)
            {
                return new XiaomiPlaybackPreparation(_status, _failure, _audioAvailable);
            }
        }

        public void StartOnce(Func<Task> start)
        {
            lock (_gate)
            {
                if (_pump is not null)
                {
                    return;
                }

                Directory.CreateDirectory(_directory);
                _pump = Task.Run(start);
                _idleCleanup = Task.Run(ExpireWhenIdleAsync);
            }
        }

        public async Task<string> WaitForPlaylistAsync(CancellationToken cancellationToken)
        {
            var waiting = Stopwatch.StartNew();
            var playlist = Path.Combine(_directory, "index.m3u8");
            while (true)
            {
                Touch();
                var preparation = GetPreparation();
                if (preparation.Status == "ready" && File.Exists(playlist))
                {
                    return playlist;
                }

                if (preparation.Status == "failed")
                {
                    throw new XiaomiPlaybackException(preparation.Error ?? "H.264 播放流准备失败。", false);
                }

                if (preparation.Status == "stopped")
                {
                    throw new XiaomiPlaybackException("播放会话已停止。", true);
                }

                if (waiting.Elapsed >= PreparationTimeout)
                {
                    throw new XiaomiPlaybackException("等待 H.264 HLS 首个视频分片超过 90 秒。", true);
                }

                await Task.Delay(TimeSpan.FromMilliseconds(200), cancellationToken);
            }
        }

        public string? GetSegmentPath(string name)
        {
            if (!name.StartsWith("segment-", StringComparison.Ordinal) ||
                !name.EndsWith(".ts", StringComparison.Ordinal) ||
                !string.Equals(name, Path.GetFileName(name), StringComparison.Ordinal))
            {
                return null;
            }

            var path = Path.Combine(_directory, name);
            return File.Exists(path) ? path : null;
        }

        public async Task TranscodeAsync(
            XiaomiLiveStream stream,
            string ffmpegExecutable,
            CancellationToken cancellationToken)
        {
            Process? process = null;
            XiaomiFfmpegMediaInput? mediaInput = null;
            Task? outputMonitor = null;
            var startup = new List<Cs2MediaPacket>();
            var startupClock = new Stopwatch();
            var startupBytes = 0;
            var videoCodec = 0;
            var audioCodec = 0;
            var audioSampleRate = 0;
            var firstVideoLogged = false;
            long? firstVideoMediaTimestamp = null;
            long? firstAudioMediaTimestamp = null;
            var initialOffsetLogged = false;
            var timelineSample = Stopwatch.StartNew();
            uint? previousSequence = null;
            long? firstTimestamp = null;
            long? previousTimestamp = null;
            long videoPackets = 0;
            long sequenceDiscontinuities = 0;
            long timestampRegressions = 0;
            try
            {
                await foreach (var frame in stream.ReadMediaFramesAsync(cancellationToken))
                {
                    if (frame.Payload.Length == 0 || frame is { IsVideo: false, IsAudio: false })
                    {
                        CryptographicOperations.ZeroMemory(frame.Payload);
                        continue;
                    }

                    if (frame.IsVideo)
                    {
                        videoCodec = videoCodec == 0 ? frame.CodecId : videoCodec;
                        firstVideoMediaTimestamp ??= frame.TimestampMilliseconds;
                        videoPackets++;
                        firstTimestamp ??= frame.TimestampMilliseconds;
                        if (previousSequence is { } sequence && frame.Sequence != unchecked(sequence + 1))
                        {
                            sequenceDiscontinuities++;
                        }

                        if (previousTimestamp is { } timestamp && frame.TimestampMilliseconds < timestamp)
                        {
                            timestampRegressions++;
                        }

                        previousSequence = frame.Sequence;
                        previousTimestamp = frame.TimestampMilliseconds;

                        if (!firstVideoLogged)
                        {
                            firstVideoLogged = true;
                            logger.LogInformation(
                                "收到首个视频帧，档位 {Profile}，输入编码 {Codec}，CS2 时间戳 {TimestampMs} ms，连接至首帧 {ElapsedMs} ms；画幅上限 {MaximumWidth}x{MaximumHeight}，帧率上限 {MaximumFps} fps，目标/峰值码率 {TargetBitrate}/{PeakBitrate} kbps，编码预设 {Preset}",
                                profile.Name,
                                frame.CodecId == 5 ? "H.265" : "H.264",
                                frame.TimestampMilliseconds,
                                _sessionClock.ElapsedMilliseconds,
                                profile.MaximumWidth,
                                profile.MaximumHeight,
                                profile.MaximumFramesPerSecond,
                                profile.TargetBitrateKbps,
                                profile.PeakBitrateKbps,
                                profile.EncoderPreset);
                        }

                        if (timelineSample.Elapsed >= TimeSpan.FromSeconds(30))
                        {
                            var timestampSpan = previousTimestamp - firstTimestamp;
                            var sourceFps = timestampSpan > 0 ? Math.Max(videoPackets - 1, 0) * 1000d / timestampSpan.Value : (double?)null;
                            logger.LogInformation(
                                "CS2 媒体时间线诊断：{PacketCount} 个视频包，时间戳跨度 {TimestampSpanMs} ms，估算 {SourceFps:F1} fps，序号不连续 {SequenceDiscontinuities} 次，时间戳倒退 {TimestampRegressions} 次",
                                videoPackets,
                                timestampSpan,
                                sourceFps,
                                sequenceDiscontinuities,
                                timestampRegressions);
                            timelineSample.Restart();
                            previousSequence = null;
                            firstTimestamp = null;
                            previousTimestamp = null;
                            videoPackets = 0;
                            sequenceDiscontinuities = 0;
                            timestampRegressions = 0;
                        }
                    }
                    else if (frame.IsAudio && audioCodec == 0)
                    {
                        audioCodec = frame.CodecId;
                        audioSampleRate = frame.AudioSampleRate;
                        firstAudioMediaTimestamp = frame.TimestampMilliseconds;
                    }

                    if (!initialOffsetLogged && firstVideoMediaTimestamp is { } videoStart && firstAudioMediaTimestamp is { } audioStart)
                    {
                        initialOffsetLogged = true;
                        logger.LogInformation("CS2 首帧音视频时间戳差 {AudioMinusVideoMs} ms", audioStart - videoStart);
                    }

                    if (process is null)
                    {
                        startup.Add(frame);
                        startupBytes += frame.Payload.Length;
                        startupClock.Start();
                        if (videoCodec == 0 && (startupClock.Elapsed >= TimeSpan.FromSeconds(10) || startupBytes >= 8 * 1024 * 1024))
                        {
                            throw new XiaomiPlaybackException("收到媒体数据，但未找到可播放的视频帧。", true);
                        }

                        if (videoCodec == 0 || (audioCodec == 0 && startupClock.Elapsed < TimeSpan.FromSeconds(6) && startupBytes < 8 * 1024 * 1024))
                        {
                            continue;
                        }

                        if (audioCodec != 0)
                        {
                            var timestampOrigin = Math.Min(firstVideoMediaTimestamp!.Value, firstAudioMediaTimestamp!.Value);
                            mediaInput = new XiaomiFfmpegMediaInput(audioCodec, audioSampleRate, timestampOrigin, firstAudioMediaTimestamp.Value);
                            lock (_gate) _audioAvailable = true;
                        }

                        process = StartFfmpeg(ffmpegExecutable, videoCodec, mediaInput);
                        mediaInput?.Start();
                        lock (_gate)
                        {
                            ffmpeg = process;
                        }

                        _ = ReadFfmpegDiagnosticsAsync(process);
                        _ = ReadFfmpegProgressAsync(process, cancellationToken);
                        outputMonitor = WatchForPlaylistAsync(process, cancellationToken);
                        while (startup.Count > 0)
                        {
                            var pending = startup[0];
                            startup.RemoveAt(0);
                            await FeedAsync(process, mediaInput, pending, cancellationToken);
                        }
                    }
                    else
                    {
                        await FeedAsync(process, mediaInput, frame, cancellationToken);
                    }
                }
            }
            finally
            {
                foreach (var pending in startup) CryptographicOperations.ZeroMemory(pending.Payload);
                if (mediaInput is not null) await mediaInput.DisposeAsync();
                if (process is not null)
                {
                    try
                    {
                        if (mediaInput is null) process.StandardInput.Close();
                        await process.WaitForExitAsync(CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
                    }
                    catch
                    {
                        if (!process.HasExited)
                        {
                            process.Kill(entireProcessTree: true);
                        }
                    }
                    finally
                    {
                        process.Dispose();
                    }
                }

                if (outputMonitor is not null)
                {
                    await IgnoreCancellationAsync(outputMonitor);
                }
            }
        }

        private static async Task FeedAsync(Process process, XiaomiFfmpegMediaInput? mediaInput, Cs2MediaPacket frame, CancellationToken cancellationToken)
        {
            if (mediaInput is not null)
            {
                mediaInput.Enqueue(frame);
                return;
            }

            try
            {
                if (frame.IsVideo)
                {
                    await process.StandardInput.BaseStream.WriteAsync(frame.Payload, cancellationToken);
                    await process.StandardInput.BaseStream.FlushAsync(cancellationToken);
                }
            }
            finally
            {
                CryptographicOperations.ZeroMemory(frame.Payload);
            }
        }

        public void Fail(string message)
        {
            lock (_gate)
            {
                if (_status is "failed" or "stopped")
                {
                    return;
                }

                _status = "failed";
                _failure = message;
            }
        }

        private void MarkReady()
        {
            lock (_gate)
            {
                if (_status == "preparing")
                {
                    _status = "ready";
                }
            }
        }

        public void Finish()
        {
            lock (_gate)
            {
                _finished = true;
                if (_status == "preparing")
                {
                    _status = Stopping.IsCancellationRequested ? "stopped" : "failed";
                    _failure = _status == "failed" ? "H.264 播放流在生成首个分片前结束。" : null;
                }
                else if (_status == "ready")
                {
                    _status = Stopping.IsCancellationRequested ? "stopped" : "failed";
                    _failure = _status == "failed" ? "视频流意外结束。" : null;
                }
            }
        }

        private Process StartFfmpeg(string executable, int codecId, XiaomiFfmpegMediaInput? mediaInput)
        {
            var inputFormat = codecId switch
            {
                5 => "hevc",
                4 => "h264",
                _ => throw new XiaomiPlaybackException("摄像头返回了暂不支持转码的视频编码。", false),
            };
            var info = new ProcessStartInfo(executable)
            {
                UseShellExecute = false,
                RedirectStandardInput = mediaInput is null,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            info.ArgumentList.Add("-hide_banner");
            info.ArgumentList.Add("-loglevel");
            info.ArgumentList.Add("info");
            info.ArgumentList.Add("-stats_period");
            info.ArgumentList.Add("5");
            info.ArgumentList.Add("-progress");
            info.ArgumentList.Add("pipe:1");
            info.ArgumentList.Add("-fflags");
            info.ArgumentList.Add("+genpts");
            if (mediaInput is not null)
            {
                // 视频按接收时钟计时，音频按采样数计时；显式平移到同一相对时间轴。
                info.ArgumentList.Add("-copyts");
                info.ArgumentList.Add("-itsoffset");
                info.ArgumentList.Add((-DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000d).ToString("F3", CultureInfo.InvariantCulture));
                info.ArgumentList.Add("-thread_queue_size");
                info.ArgumentList.Add("512");
                info.ArgumentList.Add("-use_wallclock_as_timestamps");
                info.ArgumentList.Add("1");
            }

            info.ArgumentList.Add("-f");
            info.ArgumentList.Add(inputFormat);
            info.ArgumentList.Add("-i");
            info.ArgumentList.Add(mediaInput?.VideoUrl ?? "pipe:0");
            if (mediaInput is not null)
            {
                info.ArgumentList.Add("-thread_queue_size");
                info.ArgumentList.Add("512");
                info.ArgumentList.Add("-f");
                info.ArgumentList.Add(mediaInput.AudioFormat);
                if (mediaInput.AudioCodec != 1032)
                {
                    info.ArgumentList.Add("-ar");
                    info.ArgumentList.Add(mediaInput.AudioSampleRate.ToString(CultureInfo.InvariantCulture));
                    info.ArgumentList.Add("-ac");
                    info.ArgumentList.Add("1");
                }

                info.ArgumentList.Add("-i");
                info.ArgumentList.Add(mediaInput.AudioUrl);
                info.ArgumentList.Add("-map");
                info.ArgumentList.Add("0:v:0");
                info.ArgumentList.Add("-map");
                info.ArgumentList.Add("1:a:0");
                info.ArgumentList.Add("-af");
                info.ArgumentList.Add($"asetpts=N/SR/TB+{mediaInput.AudioOffsetSeconds.ToString("F3", CultureInfo.InvariantCulture)}/TB,aresample=async=1:first_pts=0");
                info.ArgumentList.Add("-c:a");
                info.ArgumentList.Add("aac");
                info.ArgumentList.Add("-b:a");
                info.ArgumentList.Add("64k");
                info.ArgumentList.Add("-ar");
                info.ArgumentList.Add("48000");
                info.ArgumentList.Add("-ac");
                info.ArgumentList.Add("1");
            }
            else
            {
                info.ArgumentList.Add("-an");
            }

            info.ArgumentList.Add("-c:v");
            info.ArgumentList.Add("libx264");
            info.ArgumentList.Add("-preset");
            info.ArgumentList.Add(profile.EncoderPreset);
            info.ArgumentList.Add("-tune");
            info.ArgumentList.Add("zerolatency");
            info.ArgumentList.Add("-profile:v");
            info.ArgumentList.Add("baseline");
            info.ArgumentList.Add("-level:v");
            info.ArgumentList.Add(profile.MaximumWidth > 1280 ? "4.0" : "3.1");
            info.ArgumentList.Add("-pix_fmt");
            info.ArgumentList.Add("yuv420p");
            info.ArgumentList.Add("-vf");
            info.ArgumentList.Add($"scale=w='min(iw,{profile.MaximumWidth})':h='min(ih,{profile.MaximumHeight})':force_original_aspect_ratio=decrease:force_divisible_by=2");
            info.ArgumentList.Add("-b:v");
            info.ArgumentList.Add($"{profile.TargetBitrateKbps}k");
            info.ArgumentList.Add("-maxrate");
            info.ArgumentList.Add($"{profile.PeakBitrateKbps}k");
            info.ArgumentList.Add("-bufsize");
            info.ArgumentList.Add($"{profile.PeakBitrateKbps * 2}k");
            info.ArgumentList.Add("-fpsmax");
            info.ArgumentList.Add(profile.MaximumFramesPerSecond.ToString(CultureInfo.InvariantCulture));
            info.ArgumentList.Add("-force_key_frames");
            info.ArgumentList.Add("expr:gte(t,n_forced*2)");
            info.ArgumentList.Add("-f");
            info.ArgumentList.Add("hls");
            info.ArgumentList.Add("-hls_time");
            info.ArgumentList.Add("2");
            info.ArgumentList.Add("-hls_list_size");
            info.ArgumentList.Add("12");
            info.ArgumentList.Add("-hls_flags");
            info.ArgumentList.Add("delete_segments+append_list+independent_segments");
            info.ArgumentList.Add("-hls_segment_filename");
            info.ArgumentList.Add(Path.Combine(_directory, "segment-%05d.ts"));
            info.ArgumentList.Add(Path.Combine(_directory, "index.m3u8"));
            return Process.Start(info) ?? throw new XiaomiPlaybackException("无法启动 FFmpeg 媒体转码进程。", false);
        }

        private async Task WatchForPlaylistAsync(Process process, CancellationToken cancellationToken)
        {
            var playlist = Path.Combine(_directory, "index.m3u8");
            DateTime? previousPlaylistWrite = null;
            string? candidateSegment = null;
            long candidateLength = 0;
            var stableSegmentObservations = 0;
            while (!cancellationToken.IsCancellationRequested && !process.HasExited)
            {
                if (File.Exists(playlist))
                {
                    var lastWrite = File.GetLastWriteTimeUtc(playlist);
                    if (previousPlaylistWrite is not null && lastWrite > previousPlaylistWrite)
                    {
                        var interval = (lastWrite - previousPlaylistWrite.Value).TotalMilliseconds;
                        logger.LogInformation("HLS 播放列表更新，距会话启动 {ElapsedMs} ms，分片间隔约 {SegmentIntervalMs} ms", _sessionClock.ElapsedMilliseconds, (long)interval);
                    }

                    previousPlaylistWrite = lastWrite;
                    if (TryGetReadyPlaylist(playlist, out var segmentName, out var segmentLength, out var segmentCount, out var bufferedSeconds))
                    {
                        if (string.Equals(segmentName, candidateSegment, StringComparison.Ordinal) && segmentLength == candidateLength)
                        {
                            stableSegmentObservations++;
                        }
                        else
                        {
                            candidateSegment = segmentName;
                            candidateLength = segmentLength;
                            stableSegmentObservations = 0;
                        }

                        if (stableSegmentObservations >= 1 &&
                            segmentCount >= MinimumInitialSegments &&
                            bufferedSeconds >= InitialPlaylistBufferSeconds &&
                            GetPreparation().Status == "preparing")
                        {
                            MarkReady();
                            logger.LogInformation(
                                "HLS 初始缓冲就绪：耗时 {ElapsedMs} ms，{SegmentCount} 个完整分片、{BufferedSeconds:F1} 秒，最新分片 {SegmentBytes} 字节",
                                _sessionClock.ElapsedMilliseconds,
                                segmentCount,
                                bufferedSeconds,
                                segmentLength);
                        }
                    }
                    else
                    {
                        candidateSegment = null;
                        candidateLength = 0;
                        stableSegmentObservations = 0;
                    }
                }

                await Task.Delay(TimeSpan.FromMilliseconds(200), cancellationToken);
            }
        }

        private bool TryGetReadyPlaylist(string playlist, out string segmentName, out long segmentLength, out int segmentCount, out double bufferedSeconds)
        {
            segmentName = string.Empty;
            segmentLength = 0;
            segmentCount = 0;
            bufferedSeconds = 0;
            try
            {
                double? pendingDuration = null;
                foreach (var line in File.ReadLines(playlist))
                {
                    if (line.StartsWith("#EXTINF:", StringComparison.Ordinal))
                    {
                        var durationText = line[8..].Split(',', 2)[0];
                        pendingDuration = double.TryParse(durationText, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsedDuration) &&
                                          parsedDuration > 0 && double.IsFinite(parsedDuration)
                            ? parsedDuration
                            : null;
                        continue;
                    }

                    if (pendingDuration is null || line.Length == 0 || line.StartsWith('#'))
                    {
                        continue;
                    }

                    var candidate = line;
                    var duration = pendingDuration.Value;
                    pendingDuration = null;
                    if (!candidate.StartsWith("segment-", StringComparison.Ordinal) ||
                        !candidate.EndsWith(".ts", StringComparison.Ordinal) ||
                        !string.Equals(candidate, Path.GetFileName(candidate), StringComparison.Ordinal))
                    {
                        continue;
                    }

                    var path = Path.Combine(_directory, candidate);
                    using var segment = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                    if (segment.Length < 188 || segment.ReadByte() != 0x47)
                    {
                        return false;
                    }

                    segmentName = candidate;
                    segmentLength = segment.Length;
                    segmentCount++;
                    bufferedSeconds += duration;
                }

                return segmentCount > 0;
            }
            catch (IOException)
            {
                // 清单或分片可能正被 FFmpeg 更新，下一次轮询再确认。
                return false;
            }
            catch (UnauthorizedAccessException)
            {
                return false;
            }
        }

        private async Task ExpireWhenIdleAsync()
        {
            try
            {
                while (!Stopping.IsCancellationRequested)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1), Stopping.Token);
                    if (_sessionClock.Elapsed >= PreparationTimeout && GetPreparation().Status == "preparing")
                    {
                        Fail("播放准备超时：等待 HLS 初始缓冲超过 90 秒。");
                        await Stopping.CancelAsync();
                        continue;
                    }

                    lock (_gate)
                    {
                        if (DateTimeOffset.UtcNow - LastAccess <= IdleTimeout)
                        {
                            continue;
                        }
                    }

                    await Stopping.CancelAsync();
                }
            }
            catch (OperationCanceledException)
            {
                // 正常回收。
            }
            finally
            {
                try
                {
                    if (ffmpeg is { HasExited: false } process)
                    {
                        process.Kill(entireProcessTree: true);
                    }
                }
                catch
                {
                    // 进程已结束。
                }

                try
                {
                    if (Directory.Exists(_directory))
                    {
                        Directory.Delete(_directory, recursive: true);
                    }
                }
                catch
                {
                    // 下一次会话使用新的随机目录，不影响后续播放。
                }
            }
        }

        private async Task ReadFfmpegDiagnosticsAsync(Process process)
        {
            var readingOutputMetadata = false;
            try
            {
                while (await process.StandardError.ReadLineAsync() is { } line)
                {
                    if (line.StartsWith("Output #", StringComparison.Ordinal))
                    {
                        readingOutputMetadata = true;
                    }
                    else if (line.StartsWith("Input #", StringComparison.Ordinal))
                    {
                        readingOutputMetadata = false;
                    }

                    var match = Regex.Match(line, @"(?<width>\d{2,5})x(?<height>\d{2,5}).*?(?<fps>\d+(?:\.\d+)?)\s+fps", RegexOptions.CultureInvariant);
                    if (match.Success &&
                        int.TryParse(match.Groups["width"].Value, out var width) &&
                        int.TryParse(match.Groups["height"].Value, out var height) &&
                        double.TryParse(match.Groups["fps"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var framesPerSecond))
                    {
                        logger.LogInformation(
                            "FFmpeg 识别{MediaDirection}媒体：{Width}x{Height}，约 {FramesPerSecond} fps",
                            readingOutputMetadata ? "输出" : "输入",
                            width,
                            height,
                            framesPerSecond);
                    }
                }
            }
            catch
            {
                // 不保留或记录 FFmpeg 原始输出，避免泄露不相关的媒体或运行时内容。
            }
        }

        private async Task ReadFfmpegProgressAsync(Process process, CancellationToken cancellationToken)
        {
            var fields = new Dictionary<string, string>(StringComparer.Ordinal);
            var previousSample = Stopwatch.StartNew();
            TimeSpan previousCpu = process.TotalProcessorTime;
            try
            {
                while (!cancellationToken.IsCancellationRequested && await process.StandardOutput.ReadLineAsync(cancellationToken) is { } line)
                {
                    var separator = line.IndexOf('=');
                    if (separator > 0)
                    {
                        fields[line[..separator]] = line[(separator + 1)..];
                    }

                    if (!line.StartsWith("progress=", StringComparison.Ordinal))
                    {
                        continue;
                    }

                    var elapsedSeconds = Math.Max(previousSample.Elapsed.TotalSeconds, 0.001);
                    var currentCpu = process.TotalProcessorTime;
                    var cpuPercent = (currentCpu - previousCpu).TotalSeconds / elapsedSeconds / Math.Max(Environment.ProcessorCount, 1) * 100;
                    previousCpu = currentCpu;
                    var workingSetMb = process.WorkingSet64 / (1024d * 1024d);
                    fields.TryGetValue("fps", out var fps);
                    fields.TryGetValue("speed", out var speed);
                    fields.TryGetValue("frame", out var frames);
                    fields.TryGetValue("out_time_ms", out var outputTime);
                    logger.LogInformation(
                        "FFmpeg 运行指标：fps={Fps}，speed={Speed}，frame={Frames}，out_time_ms={OutputTimeMs}，CPU={CpuPercent:F1}%（整机归一化），内存={WorkingSetMb:F0} MiB",
                        fps ?? "n/a", speed ?? "n/a", frames ?? "n/a", outputTime ?? "n/a", cpuPercent, workingSetMb);
                    fields.Clear();
                    previousSample.Restart();
                }
            }
            catch (OperationCanceledException)
            {
                // 停止会话时结束指标采集。
            }
            catch
            {
                // 指标采集失败不应中断视频转码。
            }
        }

        private static async Task IgnoreCancellationAsync(Task task)
        {
            try
            {
                await task;
            }
            catch (OperationCanceledException)
            {
                // 停止会话时允许监视任务结束。
            }
        }
    }
}

public sealed record XiaomiPlaybackPreparation(string Status, string? Error, bool AudioAvailable)
{
    public static XiaomiPlaybackPreparation Stopped { get; } = new("stopped", null, false);
}

public enum XiaomiMotorStepResult
{
    Sent,
    NoSession,
    TooFrequent,
    UnsupportedModel,
}

public sealed class XiaomiPlaybackException(string message, bool retryable) : Exception(message)
{
    public bool Retryable { get; } = retryable;
}