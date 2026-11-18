namespace Meowv.Api.Modules.Music;

public sealed class MusicDeviceIssued(string id, string token)
{
    public string Id { get; } = id;
    public string Token { get; } = token;
    public override string ToString() => nameof(MusicDeviceIssued);
}