using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

// 仅测试项目编译：模拟上游 HTTP，不向生产容器注册替代音乐 Provider。
internal sealed class MusicUpstreamFixture : HttpMessageHandler
{
    internal HttpStatusCode Status = HttpStatusCode.OK;
    internal int Count;
    internal bool IncludeQqTracks;
    internal bool EmptyRecommendations;
    internal string? LastSearch;
    internal long RangeLength = 1600000;
    internal TimeSpan? RetryAfter;
    internal TimeProvider Clock = TimeProvider.System;

    private const string First = """{"id":1,"name":"睡醒就好了","artists":[{"name":"qix"}],"album":{"name":"Fixture"},"duration":100000,"fee":0}""";
    private const string Second = """{"id":2,"name":"今天也不错","artists":[{"name":"qix"}],"album":{"name":"Fixture"},"duration":100000,"fee":0}""";
    private const string NeteaseHot = """{"id":3,"name":"网易热歌","artists":[{"name":"qix"}],"duration":100000,"fee":0}""";
    private const string QqFirst = """{"id":42,"mid":"QQfixture00001","title":"睡醒就好了","interval":100,"singer":[{"name":"qix"}],"file":{"media_mid":"QQfixture00001","size_128mp3":1600000},"pay":{"pay_play":0}}""";
    private const string QqSecond = """{"mid":"QQfixture00002","title":"不同的歌曲","interval":100,"singer":[{"name":"qix"}],"file":{"media_mid":"QQfixture00002","size_128mp3":1600000},"pay":{"pay_play":0}}""";
    private const string QqHot = """{"id":43,"mid":"QQfixture00003","title":"QQ热歌","interval":100,"singer":[{"name":"qix"}],"file":{"media_mid":"QQfixture00003","size_128mp3":1600000},"pay":{"pay_play":0}}""";
    private const string QqNew = """{"id":44,"mid":"QQfixture00004","title":"QQ新歌","interval":100,"singer":[{"name":"qix"}],"file":{"media_mid":"QQfixture00004","size_128mp3":1600000},"pay":{"pay_play":0}}""";

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Interlocked.Increment(ref Count);
        var uri = request.RequestUri!;
        if (Status != HttpStatusCode.OK) return Reply(Status, "{}");
        if (uri.Host == "aqqmusic.tc.qq.com")
        {
            if (request.Headers.Range?.ToString() != "bytes=0-0") throw new InvalidOperationException("QQ CDN probe must be bounded");
            var response = Reply(HttpStatusCode.PartialContent, "");
            response.Content.Headers.ContentRange = new ContentRangeHeaderValue(0, 0, RangeLength);
            return response;
        }

        if (uri.Host == "c.y.qq.com")
            return Reply(Status, """{"code":0,"lyric":"[00:01.00]QQ fixture"}""");
        if (uri.Host == "u.y.qq.com")
        {
            if (request.Headers.Contains("Cookie") || request.Headers.Contains("Authorization"))
                throw new InvalidOperationException("Anonymous QQ requests must not carry credentials");
            using var json = JsonDocument.Parse(QueryHelpers.ParseQuery(uri.Query)["data"].ToString());
            var call = json.RootElement.GetProperty("req");
            var method = call.GetProperty("method").GetString();
            if (method == "DoSearchForQQMusicDesktop")
            {
                if (json.RootElement.TryGetProperty("comm", out _))
                    throw new InvalidOperationException("The public QQ search must not send the chart request context");
                LastSearch = call.GetProperty("param").GetProperty("query").GetString();
            }
            var date = TimeZoneInfo.ConvertTimeBySystemTimeZoneId(Clock.GetUtcNow(), "Asia/Shanghai").ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var param = call.GetProperty("param");
            var topId = param.TryGetProperty("topid", out var top) && top.ValueKind == JsonValueKind.Number && top.TryGetInt64(out var parsed) ? parsed : 0;
            var data = method switch
            {
                "GetDetail" when EmptyRecommendations => """{}""",
                "GetDetail" => topId switch
                {
                    62 => "{\"data\":{\"topId\":62,\"updateTime\":\"" + date + "\",\"song\":[{\"rank\":1,\"songId\":42}]},\"songInfoList\":[" + QqFirst + "]}",
                    26 => "{\"data\":{\"topId\":26,\"updateTime\":\"" + date + "\",\"song\":[{\"rank\":1,\"songId\":43}]},\"songInfoList\":[" + QqHot + "]}",
                    27 => "{\"data\":{\"topId\":27,\"updateTime\":\"" + date + "\",\"song\":[{\"rank\":1,\"songId\":44}]},\"songInfoList\":[" + QqNew + "]}",
                    _ => "{}"
                },
                "GetNewSong" when EmptyRecommendations => """{"song_list":[]}""",
                "GetNewSong" => "{\"song_list\":[" + QqFirst + "," + QqSecond + "]}",
                "DoSearchForQQMusicDesktop" => "{\"body\":{\"song\":{\"list\":[" + (IncludeQqTracks ? QqFirst + "," + QqSecond : "") + "]}}}",
                "CgiGetVkey" =>
                    """{"midurlinfo":[{"songmid":"QQfixture00001","result":0,"purl":"M500QQfixture00001.mp3?fixture=1"}],"sip":["https://aqqmusic.tc.qq.com/"]}""",
                _ => throw new InvalidOperationException("Unexpected QQ method")
            };
            return Reply(Status, "{\"code\":0,\"req\":{\"code\":0,\"data\":" + (IncludeQqTracks ? data : "{\"body\":{\"song\":{\"list\":[]}}}") + "}}");
        }

        string body;
        if (uri.AbsolutePath == "/api/cloudsearch/pc")
        {
            var form = QueryHelpers.ParseQuery("?" + await request.Content!.ReadAsStringAsync(ct));
            LastSearch = form["s"].ToString();
            var offset = int.Parse(form["offset"].ToString(), CultureInfo.InvariantCulture);
            var limit = int.Parse(form["limit"].ToString(), CultureInfo.InvariantCulture);
            var songs = new[] { First, Second };
            body = "{\"code\":200,\"result\":{\"songCount\":2,\"songs\":[" + string.Join(',', songs.Skip(offset).Take(limit)) + "]}}";
        }
        else if (uri.AbsolutePath == "/api/playlist/detail")
        {
            body = "{\"code\":200,\"result\":{\"updateTime\":" + Clock.GetUtcNow().ToUnixTimeMilliseconds() + ",\"tracks\":[" + (EmptyRecommendations ? "" :
                uri.Query == "?id=3778678" ? NeteaseHot : Clock == TimeProvider.System ? First : First + "," + Second) + "]}}";
        }
        else if (uri.AbsolutePath == "/api/personalized/newsong")
        {
            body = EmptyRecommendations ? """{"code":200,"result":[]}""" : "{\"code\":200,\"result\":[{\"song\":" + First + "}" + (Clock == TimeProvider.System ? ",{\"song\":" + Second + "}" : "") + "]}";
        }
        else
            body = """{"code":200,"data":[{"id":1,"code":200,"url":"https://m7.music.126.net/fixture.mp3","type":"mp3","time":100000,"expi":1200,"freeTrialInfo":null}]}""";
        return Reply(Status, body);
    }

    private HttpResponseMessage Reply(HttpStatusCode status, string body)
    {
        var response = new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        if (RetryAfter is { } delay) response.Headers.RetryAfter = new RetryConditionHeaderValue(delay);
        return response;
    }
}
