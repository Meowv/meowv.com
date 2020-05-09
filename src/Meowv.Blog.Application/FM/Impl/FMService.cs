using Meowv.Blog.Application.Caching.FM;
using Meowv.Blog.Application.Contracts.FM;
using Meowv.Blog.Domain.Configurations;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;
using Volo.Abp;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.FM.Impl
{
    public class FMService : ServiceBase, IFMService
    {
        private readonly IHttpClientFactory _httpClient;
        private readonly IFMCacheService _fmCacheService;

        public FMService(IHttpClientFactory httpClient,
                         IFMCacheService fmCacheService)
        {
            _httpClient = httpClient;
            _fmCacheService = fmCacheService;
        }

        /// <summary>
        /// 获取专辑分类
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<ChannelDto>>> GetChannelsAsync()
        {
            return await _fmCacheService.GetChannelsAsync(async () =>
            {
                var result = new ServiceResult<IEnumerable<ChannelDto>>();

                using var client = _httpClient.CreateClient();
                var response = await client.GetStringAsync(AppSettings.FMApi.Channels);
                var channels = response.FromJson<dynamic>()["data"]["channels"];

                var list = new List<ChannelDto>();

                var _channels = new List<dynamic>
                {
                    channels["scenario"],
                    channels["language"],
                    channels["artist"],
                    channels["track"],
                    channels["brand"],
                    channels["genre"]
                };

                for (int i = 0; i < _channels.Count; i++)
                {
                    foreach (var item in _channels[i])
                    {
                        list.Add(new ChannelDto
                        {
                            Id = item["id"],
                            Name = item["name"],
                            Intro = item["intro"],
                            Banner = item["banner"],
                            Cover = item["cover"]
                        });
                    }
                }

                result.IsSuccess(list);
                return result;
            });
        }

        /// <summary>
        /// 根据专辑分类获取随机歌曲
        /// </summary>
        /// <param name="channelId"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<FMDto>>> GetFmAsync(int channelId)
        {
            var result = new ServiceResult<IEnumerable<FMDto>>();

            using var client = _httpClient.CreateClient();

            var request = new HttpRequestMessage(HttpMethod.Get, AppSettings.FMApi.Song.FormatWith(channelId));
            request.Headers.Add("Cookie", "flag=\"ok\"; bid=I8DWNdOlti8; ac=\"1588990113\";");

            var response = await client.SendAsync(request);

            var json = await response.Content.ReadAsStringAsync();
            var playlist = json.FromJson<dynamic>()["song"];

            var list = new List<FMDto>();

            foreach (var item in playlist)
            {
                string sid = item["sid"];
                string ssid = item["ssid"];

                var lyric = (await GetLyricAsync(sid, ssid)).Result;

                list.Add(new FMDto
                {
                    AlbumTitle = item["albumtitle"],
                    Artist = item["artist"],
                    Picture = item["picture"],
                    Url = item["url"],
                    Sid = sid,
                    Ssid = ssid,
                    Lyric = lyric
                });
            }

            result.IsSuccess(list);
            return result;
        }

        /// <summary>
        /// 获取随机歌曲
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<FMDto>>> GetRandomFmAsync()
        {
            return await _fmCacheService.GetRandomFmAsync(async () =>
            {
                var result = new ServiceResult<IEnumerable<FMDto>>();

                var channels = (await GetChannelsAsync()).Result.Randomize(RandomHelper.GetRandom(5, 10));

                using var client = _httpClient.CreateClient();

                var list = new List<FMDto>();
                var list_task = new List<Task<dynamic>>();

                foreach (var item in channels)
                {
                    var task = Task.Run(async () =>
                    {
                        var request = new HttpRequestMessage(HttpMethod.Get, AppSettings.FMApi.Song.FormatWith(item.Id));
                        request.Headers.Add("Cookie", "flag=\"ok\"; bid=I8DWNdOlti8; ac=\"1588990113\";");

                        var response = await client.SendAsync(request);
                        var json = await response.Content.ReadAsStringAsync();

                        return json.FromJson<dynamic>()["song"];
                    });
                    list_task.Add(task);
                }
                Task.WaitAll(list_task.ToArray());

                foreach (var task in list_task)
                {
                    var _list = await task;

                    foreach (var item in _list)
                    {
                        string sid = item["sid"];
                        string ssid = item["ssid"];

                        var lyric = (await GetLyricAsync(sid, ssid)).Result;

                        list.Add(new FMDto
                        {
                            AlbumTitle = item["albumtitle"],
                            Artist = item["artist"],
                            Picture = item["picture"],
                            Url = item["url"],
                            Sid = sid,
                            Ssid = ssid,
                            Lyric = lyric
                        });
                    }
                }

                result.IsSuccess(list);
                return result;
            });
        }

        /// <summary>
        /// 获取歌词
        /// </summary>
        /// <param name="sid"></param>
        /// <param name="ssid"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetLyricAsync(string sid, string ssid)
        {
            return await _fmCacheService.GetLyricAsync(sid, ssid, async () =>
            {
                var result = new ServiceResult<string>();

                using var client = _httpClient.CreateClient();
                try
                {
                    var response = await client.GetStringAsync(AppSettings.FMApi.Lyric.FormatWith(sid, ssid));
                    string lyric = response.FromJson<dynamic>()["lyric"];
                    result.IsSuccess(lyric);
                }
                catch
                {
                    result.IsFailed(ResponseText.PARAMETER_ERROR);
                }
                return result;
            });
        }
    }
}