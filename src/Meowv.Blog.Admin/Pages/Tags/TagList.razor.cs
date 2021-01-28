using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.Tags
{
    public partial class TagList
    {
        List<GetAdminTagDto> tags;

        protected override async Task OnInitializedAsync()
        {
            tags = await GetTagListAsync();
        }

        public async Task<List<GetAdminTagDto>> GetTagListAsync()
        {
            var response = await GetResultAsync<BlogResponse<List<GetAdminTagDto>>>("api/meowv/blog/admin/tags");
            return response.Result;
        }

        public async Task DeleteAsync(string id)
        {
            var response = await GetResultAsync<BlogResponse>($"api/meowv/blog/tag/{id}", method: HttpMethod.Delete);
            if (response.Success)
            {
                await Message.Success("删除成功", 0.5);
                tags = await GetTagListAsync();
            }
            else
            {
                await Message.Error("删除失败");
            }
        }
    }
}