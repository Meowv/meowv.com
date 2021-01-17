using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// Get the list of friendlinks.
        /// </summary>
        /// <returns></returns>
        [Route("api/meowv/blog/friendlinks")]
        public async Task<BlogResponse<List<FriendLinkDto>>> GetFriendLinksAsync()
        {
            return await _cache.GetFriendLinksAsync(async () =>
            {
                var response = new BlogResponse<List<FriendLinkDto>>();

                var friendLinks = await _friendLinks.GetListAsync();

                var result = ObjectMapper.Map<List<FriendLink>, List<FriendLinkDto>>(friendLinks);

                response.Result = result;
                return response;
            });
        }
    }
}