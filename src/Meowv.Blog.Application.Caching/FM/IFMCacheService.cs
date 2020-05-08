using Meowv.Blog.Application.Contracts.FM;
using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Caching.FM
{
    public interface IFMCacheService
    {
        /// <summary>
        /// 获取专辑分类
        /// </summary>
        /// <param name="specific"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<ChannelDto>>> GetChannelsAsync(string specific, Func<Task<ServiceResult<IEnumerable<ChannelDto>>>> factory);
    }
}