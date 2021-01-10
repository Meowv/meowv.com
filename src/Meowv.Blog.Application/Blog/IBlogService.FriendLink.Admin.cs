using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog
{
    public partial interface IBlogService
    {
        Task<BlogResponse> CreateFriendlinkAsync(CreateFriendLinkInput input);

        Task<BlogResponse> DeleteFriendlinkAsync(string id);

        Task<BlogResponse> UpdateFriendlinkAsync(string id, UpdateFriendLinkInput input);

        Task<BlogResponse<List<GetAdminFriendLinkDto>>> GetAdminFriendlinksAsync();
    }
}