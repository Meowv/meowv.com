using System.Globalization;
using System.Net;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

// 仅测试项目编译：模拟上游HTTP，不向生产容器注册替代音乐Provider。
internal sealed class MusicUpstreamFixture : HttpMessageHandler
{
    internal HttpStatusCode Status = HttpStatusCode.OK;
    internal int Count;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Interlocked.Increment(ref Count);
        string body;
        if (request.RequestUri!.AbsolutePath == "/api/search/get/web")
        {
            var form = QueryHelpers.ParseQuery("?" + await request.Content!.ReadAsStringAsync(ct));
            var offset = int.Parse(form["offset"].ToString(), CultureInfo.InvariantCulture);
            var limit = int.Parse(form["limit"].ToString(), CultureInfo.InvariantCulture);
            string[] songs = [
                "{\"id\":1,\"name\":\"睡醒就好了\",\"artists\":[{\"name\":\"qix\"}],\"album\":{\"name\":\"Fixture\"},\"duration\":100000,\"fee\":0}",
                "{\"id\":2,\"name\":\"今天也不错\",\"artists\":[{\"name\":\"qix\"}],\"album\":{\"name\":\"Fixture\"},\"duration\":100000,\"fee\":0}"];
            body = "{\"code\":200,\"result\":{\"songCount\":2,\"songs\":[" + string.Join(',', songs.Skip(offset).Take(limit)) + "]}}";
        }
        else body = "{\"code\":200,\"data\":[{\"id\":1,\"code\":200,\"url\":\"https://m7.music.126.net/fixture.mp3\",\"type\":\"mp3\",\"time\":100000,\"expi\":1200,\"freeTrialInfo\":null}]}";
        return new HttpResponseMessage(Status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }
}
