using Meowv.Blog.Application.Contracts.FM;
using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.FM
{
    public interface IFMService
    {
        /// <summary>
        /// 获取专辑分类
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<ChannelDto>>> GetChannelsAsync(string specific);

        /// <summary>
        /// 根据专辑分类获取随机歌曲
        /// </summary>
        /// <param name="channelId"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<FMDto>>> GetFmAsync(int channelId);
    }
}