using System.Buffers.Binary;
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

/// <summary>将摄像机的 Opus 访问单元封装为 FFmpeg 可读取的 Ogg Opus 流。</summary>
internal sealed class OggOpusWriter(Stream output)
{
    private readonly uint _serial = BitConverter.ToUInt32(RandomNumberGenerator.GetBytes(4));
    private uint _sequence;
    private long _granulePosition;

    public async Task WriteHeadersAsync(CancellationToken cancellationToken)
    {
        var head = new byte[19];
        "OpusHead"u8.CopyTo(head);
        head[8] = 1;
        head[9] = 1;
        BinaryPrimitives.WriteUInt32LittleEndian(head.AsSpan(12), 48000);
        await WritePageAsync(head, 2, 0, cancellationToken);

        var tags = new byte[22];
        "OpusTags"u8.CopyTo(tags);
        BinaryPrimitives.WriteUInt32LittleEndian(tags.AsSpan(8), 6);
        "Xiaomi"u8.CopyTo(tags.AsSpan(12));
        await WritePageAsync(tags, 0, 0, cancellationToken);
    }

    public async Task WritePacketAsync(byte[] packet, CancellationToken cancellationToken)
    {
        if (packet.Length == 0) return;
        _granulePosition += PacketSamples(packet);
        await WritePageAsync(packet, 0, _granulePosition, cancellationToken);
    }

    private async Task WritePageAsync(byte[] packet, byte headerType, long position, CancellationToken cancellationToken)
    {
        var segments = packet.Length / 255 + 1;
        if (segments > 255) throw new XiaomiPlaybackException("Opus 音频帧过长。", false);
        var page = new byte[27 + segments + packet.Length];
        "OggS"u8.CopyTo(page);
        page[4] = 0;
        page[5] = headerType;
        BinaryPrimitives.WriteInt64LittleEndian(page.AsSpan(6), position);
        BinaryPrimitives.WriteUInt32LittleEndian(page.AsSpan(14), _serial);
        BinaryPrimitives.WriteUInt32LittleEndian(page.AsSpan(18), _sequence++);
        page[26] = (byte)segments;
        for (var index = 0; index < segments; index++)
        {
            page[27 + index] = (byte)Math.Min(255, packet.Length - index * 255);
        }

        packet.AsSpan().CopyTo(page.AsSpan(27 + segments));
        var checksum = 0u;
        foreach (var value in page)
        {
            checksum ^= (uint)value << 24;
            for (var bit = 0; bit < 8; bit++)
            {
                checksum = (checksum << 1) ^ ((checksum & 0x80000000) != 0 ? 0x04C11DB7u : 0u);
            }
        }

        BinaryPrimitives.WriteUInt32LittleEndian(page.AsSpan(22), checksum);
        try
        {
            await output.WriteAsync(page, cancellationToken);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(page);
        }
    }

    private static int PacketSamples(ReadOnlySpan<byte> packet)
    {
        var config = packet[0] >> 3;
        var frameSamples = config < 12
            ? (config % 4) switch { 0 => 480, 1 => 960, 2 => 1920, _ => 2880 }
            : config < 16
                ? (config % 2 == 0 ? 480 : 960)
                : (config % 4) switch { 0 => 120, 1 => 240, 2 => 480, _ => 960 };
        var count = (packet[0] & 3) switch
        {
            0 => 1,
            1 or 2 => 2,
            _ => packet.Length > 1 ? packet[1] & 63 : 0,
        };
        var samples = frameSamples * count;
        return samples is > 0 and <= 5760 ? samples : throw new XiaomiPlaybackException("Opus 帧时长无效。", false);
    }
}