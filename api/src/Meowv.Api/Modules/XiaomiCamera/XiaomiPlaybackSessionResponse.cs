namespace Meowv.Api.Modules.XiaomiCamera;

public sealed record XiaomiPlaybackSessionResponse(string PlaylistUrl, string Status, string StatusUrl, bool AudioAvailable);