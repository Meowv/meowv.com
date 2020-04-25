using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.Domain.Blog;
using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// 查询友链列表
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<FriendLinkDto>>> QueryFriendLinksAsync()
        {
            return await _blogCacheService.QueryFriendLinksAsync(async () =>
            {
                var result = new ServiceResult<IEnumerable<FriendLinkDto>>();

                var friendLinks = await _friendLinksRepository.GetListAsync();
                var list = ObjectMapper.Map<IEnumerable<FriendLink>, IEnumerable<FriendLinkDto>>(friendLinks);

                result.IsSuccess(list);
                return result;
            });
        }
    }
}