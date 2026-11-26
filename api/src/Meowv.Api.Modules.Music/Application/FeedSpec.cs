
namespace Meowv.Api.Modules.Music.Application;

internal sealed record FeedSpec(string Id, string ProviderId, string Kind, string UpstreamId, int Limit = 30)
{
    public bool HasUpstreamDate => Kind is "playlist" or "toplist";

    internal static FeedSpec[] Defaults =>
    [
        new("rising", NeteaseMusicProvider.Id, "playlist", "19723756"),
        new("netease-hot", NeteaseMusicProvider.Id, "playlist", "3778678"),
        new("rising", QQMusicProvider.Id, "toplist", "62"),
        new("new-songs", NeteaseMusicProvider.Id, "newsong", "0"),
        new("new-songs", QQMusicProvider.Id, "new", "0"),
        new("qq-hot", QQMusicProvider.Id, "toplist", "26"),
        new("qq-new", QQMusicProvider.Id, "toplist", "27")
    ];
}
