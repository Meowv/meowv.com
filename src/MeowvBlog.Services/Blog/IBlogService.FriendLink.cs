using MeowvBlog.Services.Dto.Blog;
using Plus;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog
{
    public partial interface IBlogService
    {
        /// <summary>
        /// 新增友链
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertFriendLink(FriendLinkDto dto);

        /// <summary>
        /// 友链列表
        /// </summary>
        /// <returns></returns>
        Task<ActionOutput<IList<FriendLinkDto>>> QueryFriendLinks();
    }
}