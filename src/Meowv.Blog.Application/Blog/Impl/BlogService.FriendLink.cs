using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// Get friendLink list.
        /// </summary>
        /// <returns></returns>
        public async Task<BlogResponse<List<FriendLinkDto>>> GetFriendlinksAsync()
        {
            var response = new BlogResponse<List<FriendLinkDto>>();

            var friendLinks = await _friendLinks.GetListAsync();

            var result = ObjectMapper.Map<List<FriendLink>, List<FriendLinkDto>>(friendLinks);

            response.Result = result;
            return response;
        }
    }
}