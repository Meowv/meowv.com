using AntDesign;
using Meowv.Blog.Admin.Services;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.Posts
{
    public partial class PostList : PageBase
    {
        public int page = 1;
        public int limit = 15;
        public int total = 0;

        IReadOnlyList<GetAdminPostDto> posts;

        protected override async Task OnInitializedAsync()
        {
            posts = await GetPostListAsync(page, limit);
        }

        public async Task<IReadOnlyList<GetAdminPostDto>> GetPostListAsync(int page, int limit)
        {
            var response = await GetResultAsync<BlogResponse<PagedList<GetAdminPostDto>>>($"api/meowv/blog/admin/posts/{page}/{limit}");

            total = response.Result.Total;

            return response.Result.Item;
        }

        public async Task HandlePageIndexChange(PaginationEventArgs args)
        {
            posts = await GetPostListAsync(page, limit);
        }
    }
}