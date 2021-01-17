using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog
{
    public partial interface IBlogService
    {
        Task<BlogResponse> CreateFriendLinkAsync(CreateFriendLinkInput input);

        Task<BlogResponse> DeleteFriendLinkAsync(string id);

        Task<BlogResponse> UpdateFriendLinkAsync(string id, UpdateFriendLinkInput input);

        Task<BlogResponse<List<GetAdminFriendLinkDto>>> GetAdminFriendLinksAsync();
    }
}