using System.Collections.Concurrent;
using System.Diagnostics;
using System.Security.Cryptography;
using XiaomiCamera.Protocol;

namespace XiaomiCamera;

/// <summary>
/// 将小米私有媒体帧转成浏览器通用的 H.264 HLS。
/// 摄像头上游会话与 FFmpeg 进程按设备共享；HLS 分片只存在于临时目录。
/// </summary>
public sealed class XiaomiHlsService(XiaomiLiveStreamService streams, XiaomiFfmpegResolver ffmpeg)
{
    private readonly ConcurrentDictionary<string, HlsState> states = new(StringComparer.Ordinal);

    public void Start(string fingerprint)
    {
        while (true)
        {
            var state = states.GetOrAdd(fingerprint, static key => new HlsState(key));
            if (state.CanAcceptRequests)
            {
                state.Touch();
                state.StartOnce(() => PumpAsync(state));
                return;
            }

            states.TryRemove(new KeyValuePair<string, HlsState>(fingerprint, state));
        }
    }

    /// <summary>首次返回播放列表前等待 FFmpeg 生成可独立解码的 H.264 分片。</summary>
    public async Task<string> WaitForPlaylistAsync(string fingerprint, CancellationToken cancellationToken)
    {
        Start(fingerprint);
        var state = states[fingerprint];
        return await state.WaitForPlaylistAsync(cancellationToken);
    }

    public string? SegmentPath(string fingerprint, string name)
    {
        if (!states.TryGetValue(fingerprint, out var state))
        {
            return null;
        }

        state.Touch();
        return state.GetSegmentPath(name);
    }

    private async Task PumpAsync(HlsState state)
    {
        try
        {
            await using var stream = await streams.OpenAsync(state.Fingerprint, state.Stopping.Token);
            await state.TranscodeAsync(stream, ffmpeg.ExecutablePath, state.Stopping.Token);
        }
        catch (OperationCanceledException) when (state.Stopping.IsCancellationRequested)
        {
            // 无观看者时回收临时会话。
        }
        catch (XiaomiLiveStreamException exception)
        {
            state.Fail(exception.Message);
        }
        catch (Exception)
        {
            // 不将进程参数、媒体内容或连接材料写入日志或 API 响应。
            state.Fail("无法建立 H.264 浏览器播放流。");
        }
        finally
        {
            state.Finish();
        }
    }

    private sealed class HlsState(string fingerprint)
    {
        private static readonly TimeSpan IdleTimeout = TimeSpan.FromSeconds(30);
        private readonly Lock gate = new();
        private readonly TaskCompletionSource<string> firstPlaylist = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly string directory = Path.Combine(Path.GetTempPath(), "xiaomi-camera-gateway-hls", $"{fingerprint}-{Guid.NewGuid():N}");
        private Task? pump;
        private Process? ffmpeg;
        private bool finished;

        public string Fingerprint { get; } = fingerprint;
        public CancellationTokenSource Stopping { get; } = new();
        private DateTimeOffset LastAccess { get; set; } = DateTimeOffset.UtcNow;

        public bool CanAcceptRequests
        {
            get
            {
                lock (gate)
                {
                    return !finished && !Stopping.IsCancellationRequested;
                }
            }
        }

        public void Touch()
        {
            lock (gate)
            {
                LastAccess = DateTimeOffset.UtcNow;
            }
        }

        public void StartOnce(Func<Task> start)
        {
            lock (gate)
            {
                if (pump is not null)
                {
                    return;
                }

                Directory.CreateDirectory(directory);
                pump = Task.Run(start);
                _ = Task.Run(ExpireWhenIdleAsync);
            }
        }

        public async Task<string> WaitForPlaylistAsync(CancellationToken cancellationToken)
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token, Stopping.Token);
            try
            {
                return await firstPlaylist.Task.WaitAsync(linked.Token);
            }
            catch (OperationCanceledException) when (timeout.IsCancellationRequested)
            {
                throw new XiaomiPlaybackException("等待 H.264 HLS 首个视频分片超时。", true);
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

            var path = Path.Combine(directory, name);
            return File.Exists(path) ? path : null;
        }

        public async Task TranscodeAsync(
            XiaomiLiveStream stream,
            string ffmpegExecutable,
            CancellationToken cancellationToken)
        {
            Process? process = null;
            Task? outputMonitor = null;
            try
            {
                await foreach (var frame in stream.ReadMediaFramesAsync(cancellationToken))
                {
                    try
                    {
                        if (!frame.IsVideo || frame.Payload.Length == 0)
                        {
                            continue;
                        }

                        if (process is null)
                        {
                            process = StartFfmpeg(ffmpegExecutable, frame.CodecId);
                            lock (gate)
                            {
                                ffmpeg = process;
                            }

                            _ = DrainStandardErrorAsync(process);
                            outputMonitor = WatchForPlaylistAsync(process, cancellationToken);
                        }

                        await process.StandardInput.BaseStream.WriteAsync(frame.Payload, cancellationToken);
                        await process.StandardInput.BaseStream.FlushAsync(cancellationToken);
                    }
                    finally
                    {
                        CryptographicOperations.ZeroMemory(frame.Payload);
                    }
                }
            }
            finally
            {
                if (process is not null)
                {
                    try
                    {
                        process.StandardInput.Close();
                        await process.WaitForExitAsync(CancellationToken.None);
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

        public void Fail(string message)
        {
            lock (gate)
            {
                firstPlaylist.TrySetException(new XiaomiPlaybackException(message, false));
            }
        }

        public void Finish()
        {
            lock (gate)
            {
                finished = true;
                if (!firstPlaylist.Task.IsCompleted)
                {
                    firstPlaylist.TrySetException(new XiaomiPlaybackException("H.264 播放流在生成首个分片前结束。", true));
                }
            }
        }

        private Process StartFfmpeg(string executable, int codecId)
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
                RedirectStandardInput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            info.ArgumentList.Add("-hide_banner");
            info.ArgumentList.Add("-loglevel");
            info.ArgumentList.Add("error");
            info.ArgumentList.Add("-fflags");
            info.ArgumentList.Add("+genpts");
            info.ArgumentList.Add("-r");
            info.ArgumentList.Add("25");
            info.ArgumentList.Add("-f");
            info.ArgumentList.Add(inputFormat);
            info.ArgumentList.Add("-i");
            info.ArgumentList.Add("pipe:0");
            info.ArgumentList.Add("-an");
            info.ArgumentList.Add("-c:v");
            info.ArgumentList.Add("libx264");
            info.ArgumentList.Add("-preset");
            info.ArgumentList.Add("veryfast");
            info.ArgumentList.Add("-tune");
            info.ArgumentList.Add("zerolatency");
            info.ArgumentList.Add("-profile:v");
            info.ArgumentList.Add("baseline");
            info.ArgumentList.Add("-level:v");
            info.ArgumentList.Add("3.1");
            info.ArgumentList.Add("-pix_fmt");
            info.ArgumentList.Add("yuv420p");
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
            info.ArgumentList.Add(Path.Combine(directory, "segment-%05d.ts"));
            info.ArgumentList.Add(Path.Combine(directory, "index.m3u8"));
            return Process.Start(info) ?? throw new XiaomiPlaybackException("无法启动 FFmpeg 媒体转码进程。", false);
        }

        private async Task WatchForPlaylistAsync(Process process, CancellationToken cancellationToken)
        {
            var playlist = Path.Combine(directory, "index.m3u8");
            while (!cancellationToken.IsCancellationRequested && !process.HasExited)
            {
                if (File.Exists(playlist) && Directory.EnumerateFiles(directory, "segment-*.ts").Any())
                {
                    firstPlaylist.TrySetResult(playlist);
                    return;
                }

                await Task.Delay(TimeSpan.FromMilliseconds(200), cancellationToken);
            }
        }

        private async Task ExpireWhenIdleAsync()
        {
            try
            {
                while (!Stopping.IsCancellationRequested)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1), Stopping.Token);
                    lock (gate)
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
                    if (Directory.Exists(directory))
                    {
                        Directory.Delete(directory, recursive: true);
                    }
                }
                catch
                {
                    // 下一次会话使用新的随机目录，不影响后续播放。
                }
            }
        }

        private static async Task DrainStandardErrorAsync(Process process)
        {
            try
            {
                await process.StandardError.ReadToEndAsync();
            }
            catch
            {
                // 仅避免 FFmpeg 的错误管道堵塞；不保留媒体诊断内容。
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

public sealed class XiaomiPlaybackException(string message, bool retryable) : Exception(message)
{
    public bool Retryable { get; } = retryable;
}