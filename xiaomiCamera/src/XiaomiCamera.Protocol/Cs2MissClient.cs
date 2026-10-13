using System.Text;
using System.Text.Json;

namespace XiaomiCamera.Protocol;

/// <summary>MISS 明文鉴权及会话建立后的加密播放与控制命令。</summary>
public sealed class Cs2MissClient(Cs2PpppConnection connection)
{
    public const int AuthenticateRequest = 0x100;
    public const int AuthenticateResponse = 0x101;
    public const int StartVideoRequest = 0x102;
    public const int StopVideoRequest = 0x103;
    public const int StartAudioRequest = 0x104;
    public const int MotorRequest = 0x112;
    public const int EncryptedCommand = 0x1001;

    public async Task AuthenticateAsync(Cs2Provisioning provisioning, TimeSpan timeout, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(provisioning);
        if (timeout <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(timeout));
        }

        var body = JsonSerializer.SerializeToUtf8Bytes(
            new Cs2MissAuthenticationRequest(provisioning.ClientPublicKey, provisioning.Sign, Guid.NewGuid(), 15),
            Cs2MissJsonContext.Default.Cs2MissAuthenticationRequest);
        var deadline = DateTimeOffset.UtcNow + timeout;
        var attempts = 0;
        while (DateTimeOffset.UtcNow < deadline)
        {
            attempts++;
            await connection.SendCommandAsync(AuthenticateRequest, body, cancellationToken);
            var remaining = deadline - DateTimeOffset.UtcNow;
            var response = await connection.ReadCommandAsync(
                remaining < TimeSpan.FromSeconds(2) ? remaining : TimeSpan.FromSeconds(2),
                cancellationToken);
            if (response is null || response.Command != AuthenticateResponse)
            {
                continue;
            }

            if (IsSuccess(response.Body))
            {
                return;
            }

            throw new Cs2MissException("摄像机拒绝了 MISS 鉴权。");
        }

        throw new Cs2MissException($"未收到 MISS 鉴权响应（已尝试 {attempts} 次）。");
    }

    private static bool IsSuccess(byte[] body)
    {
        try
        {
            using var response = JsonDocument.Parse(body);
            return response.RootElement.TryGetProperty("result", out var result) &&
                   string.Equals(result.GetString(), "success", StringComparison.Ordinal);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public async Task StartVideoAsync(byte[] sessionKey, int quality, bool enableAudio, CancellationToken cancellationToken)
    {
        if (quality is < 0 or > 3)
        {
            throw new ArgumentOutOfRangeException(nameof(quality));
        }

        var body = Encoding.UTF8.GetBytes($"{{\"videoquality\":{quality},\"enableaudio\":{(enableAudio ? 1 : 0)}}}");
        await SendEncryptedAsync(sessionKey, StartVideoRequest, body, cancellationToken);
    }

    public Task StartAudioAsync(byte[] sessionKey, CancellationToken cancellationToken) =>
        SendEncryptedAsync(sessionKey, StartAudioRequest, ReadOnlyMemory<byte>.Empty, cancellationToken);

    public Task MotorStepAsync(byte[] sessionKey, int operation, CancellationToken cancellationToken)
    {
        if (operation is < 1 or > 4)
        {
            throw new ArgumentOutOfRangeException(nameof(operation));
        }

        return SendEncryptedAsync(sessionKey, MotorRequest, Encoding.UTF8.GetBytes($"{{\"operation\":{operation}}}"), cancellationToken);
    }

    public Task StopVideoAsync(byte[] sessionKey, CancellationToken cancellationToken) => SendEncryptedAsync(sessionKey, StopVideoRequest, ReadOnlyMemory<byte>.Empty, cancellationToken);

    private async Task SendEncryptedAsync(byte[] sessionKey, int command, ReadOnlyMemory<byte> body, CancellationToken cancellationToken)
    {
        var inner = new byte[sizeof(int) + body.Length];
        System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(inner, command);
        body.CopyTo(inner.AsMemory(sizeof(int)));
        var encrypted = Cs2MissCrypto.Encrypt(sessionKey, inner);
        try
        {
            await connection.SendCommandAsync(EncryptedCommand, encrypted, cancellationToken);
        }
        finally
        {
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(inner);
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(encrypted);
        }
    }
}

public sealed class Cs2MissException(string message) : Exception(message);