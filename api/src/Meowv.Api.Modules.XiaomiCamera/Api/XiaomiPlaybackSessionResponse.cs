namespace Meowv.Api.Modules.XiaomiCamera.Api;

public sealed record XiaomiPlaybackSessionResponse(string PlaylistUrl, string Status, string StatusUrl, bool AudioAvailable);