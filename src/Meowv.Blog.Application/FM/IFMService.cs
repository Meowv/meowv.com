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
        /// <param name="specific"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<ChannelDto>>> GetChannelsAsync(string specific);
    }
}