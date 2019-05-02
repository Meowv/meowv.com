using MeowvBlog.Services.Dto.FriendLinks;
using System.Collections.Generic;
using System.Threading.Tasks;
using UPrime;

namespace MeowvBlog.Services.FriendLinks
{
    /// <summary>
    /// 友情链接服务接口
    /// </summary>
    public interface IFriendLinkService
    {
        /// <summary>
        /// 友情链接列表
        /// </summary>
        /// <returns></returns>
        Task<ActionOutput<IList<FriendLinkDto>>> GetAsync();
    }
}