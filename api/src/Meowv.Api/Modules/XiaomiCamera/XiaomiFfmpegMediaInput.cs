using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Threading.Channels;
using Meowv.Api.Modules.XiaomiCamera.Protocol;

namespace Meowv.Api.Modules.XiaomiCamera;

/// <summary>通过仅绑定本机的临时 TCP 输入，将音视频访问单元分别送入 FFmpeg。</summary>
internal sealed class XiaomiFfmpegMediaInput : IAsyncDisposable
{
    private readonly TcpListener _videoListener = new(IPAddress.Loopback, 0);
    private readonly TcpListener _audioListener = new(IPAddress.Loopback, 0);
    private readonly Channel<Cs2MediaPacket> _video = CreateQueue();
    private readonly Channel<Cs2MediaPacket> _audio = CreateQueue();
    private readonly CancellationTokenSource _stopping = new();
    private readonly long _timestampOrigin;
    private readonly int _audioCodec;
    private readonly int _audioSampleRate;
    private readonly System.Diagnostics.Stopwatch _clock = new();
    private Task? _videoWriter;
    private Task? _audioWriter;
    private bool _disposed;

    public XiaomiFfmpegMediaInput(int audioCodec, int audioSampleRate, long timestampOrigin, long firstAudioTimestamp)
    {
        if (audioCodec is not (1024 or 1026 or 1027 or 1032))
        {
            throw new ArgumentOutOfRangeException(nameof(audioCodec));
        }

        _audioCodec = audioCodec;
        _audioSampleRate = audioSampleRate;
        _timestampOrigin = timestampOrigin;
        AudioOffsetSeconds = Math.Max(0, firstAudioTimestamp - timestampOrigin) / 1000d;
        _videoListener.Start(1);
        _audioListener.Start(1);
    }

    public string VideoUrl => $"tcp://127.0.0.1:{((IPEndPoint)_videoListener.LocalEndpoint).Port}";
    public string AudioUrl => $"tcp://127.0.0.1:{((IPEndPoint)_audioListener.LocalEndpoint).Port}";

    public string AudioFormat => _audioCodec switch
    {
        1024 => "s16le",
        1026 => "mulaw",
        1027 => "alaw",
        1032 => "ogg",
        _ => throw new InvalidOperationException(),
    };

    public double AudioOffsetSeconds { get; }
    public int AudioCodec => _audioCodec;
    public int AudioSampleRate => _audioSampleRate;

    public void Start()
    {
        _clock.Start();
        _videoWriter = Task.Run(() => WriteAsync(_videoListener, _video.Reader, false));
        _audioWriter = Task.Run(() => WriteAsync(_audioListener, _audio.Reader, true));
    }

    public void Enqueue(Cs2MediaPacket packet)
    {
        if (_videoWriter?.IsFaulted == true || _audioWriter?.IsFaulted == true)
        {
            CryptographicOperations.ZeroMemory(packet.Payload);
            throw new XiaomiPlaybackException("FFmpeg 音视频输入已中断。", true);
        }

        if (packet.IsAudio && (packet.CodecId != _audioCodec || packet.AudioSampleRate != _audioSampleRate))
        {
            CryptographicOperations.ZeroMemory(packet.Payload);
            throw new XiaomiPlaybackException("摄像头音频编码或采样率在播放期间发生变化。", true);
        }

        var target = packet.IsVideo ? _video : packet.IsAudio ? _audio : null;
        if (target is null)
        {
            CryptographicOperations.ZeroMemory(packet.Payload);
            return;
        }

        if (!target.Writer.TryWrite(packet))
        {
            CryptographicOperations.ZeroMemory(packet.Payload);
            throw new XiaomiPlaybackException("FFmpeg 音视频输入队列已满。", true);
        }
    }

    private async Task WriteAsync(TcpListener listener, ChannelReader<Cs2MediaPacket> reader, bool isAudio)
    {
        using var client = await listener.AcceptTcpClientAsync(_stopping.Token);
        client.NoDelay = true;
        await using var output = client.GetStream();
        OggOpusWriter? ogg = null;
        if (isAudio && _audioCodec == 1032)
        {
            ogg = new OggOpusWriter(output);
            await ogg.WriteHeadersAsync(_stopping.Token);
        }

        await foreach (var packet in reader.ReadAllAsync(_stopping.Token))
        {
            try
            {
                var offset = Math.Max(0, packet.TimestampMilliseconds - _timestampOrigin);
                // 音频由采样数计时；保留 FFmpeg 探测期间排队的帧，避免压缩时间轴。
                var delay = offset - _clock.ElapsedMilliseconds;
                if (delay is > 0 and < 2000)
                {
                    await Task.Delay(TimeSpan.FromMilliseconds(delay), _stopping.Token);
                }

                if (ogg is null)
                {
                    await output.WriteAsync(packet.Payload, _stopping.Token);
                }
                else
                {
                    await ogg.WritePacketAsync(packet.Payload, _stopping.Token);
                }
            }
            finally
            {
                CryptographicOperations.ZeroMemory(packet.Payload);
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        await _stopping.CancelAsync();
        _video.Writer.TryComplete();
        _audio.Writer.TryComplete();
        _videoListener.Stop();
        _audioListener.Stop();
        await IgnoreStoppedAsync(_videoWriter);
        await IgnoreStoppedAsync(_audioWriter);
        while (_video.Reader.TryRead(out var packet)) CryptographicOperations.ZeroMemory(packet.Payload);
        while (_audio.Reader.TryRead(out var packet)) CryptographicOperations.ZeroMemory(packet.Payload);
        _stopping.Dispose();
    }

    private static Channel<Cs2MediaPacket> CreateQueue() => Channel.CreateBounded<Cs2MediaPacket>(
        new BoundedChannelOptions(512)
        {
            SingleReader = true,
            SingleWriter = true,
            FullMode = BoundedChannelFullMode.Wait,
        });

    private static async Task IgnoreStoppedAsync(Task? task)
    {
        if (task is null) return;
        try
        {
            await task;
        }
        catch (Exception)
        {
            // 转码失败由媒体主循环报告；清理时仍需回收排队载荷。
        }
    }
}