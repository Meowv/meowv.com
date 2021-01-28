using AntDesign;
using Meowv.Blog.Admin.Services;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.Posts
{
    public partial class PostList : PageBase
    {
        int page = 1;
        int limit = 10;
        int total = 0;
        IReadOnlyList<GetAdminPostDto> posts;

        protected override async Task OnInitializedAsync()
        {
            posts = await GetPostListAsync(page, limit);
        }

        public async Task HandlePageIndexChange(PaginationEventArgs args)
        {
            posts = await GetPostListAsync(page, limit);
        }

        public async Task<IReadOnlyList<GetAdminPostDto>> GetPostListAsync(int page, int limit)
        {
            var response = await GetResultAsync<BlogResponse<PagedList<GetAdminPostDto>>>($"api/meowv/blog/admin/posts/{page}/{limit}");

            total = response.Result.Total;

            return response.Result.Item;
        }

        public async Task DeleteAsync(string id)
        {
            var response = await GetResultAsync<BlogResponse>($"api/meowv/blog/post/{id}", method: HttpMethod.Delete);
            if (response.Success)
            {
                await Message.Success("删除成功", 0.5);
                posts = await GetPostListAsync(page, limit);
            }
            else
            {
                await Message.Error("删除失败");
            }
        }
    }
}