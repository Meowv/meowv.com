using Meowv.Blog.Application.Caching.FM;
using Meowv.Blog.Application.Contracts.FM;
using Meowv.Blog.Domain.Configurations;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

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
    }
}