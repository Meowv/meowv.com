using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.Categories
{
    public partial class CategoryList
    {
        List<GetAdminCategoryDto> categories;

        protected override async Task OnInitializedAsync()
        {
            categories = await GetCategoryListAsync();
        }

        public async Task<List<GetAdminCategoryDto>> GetCategoryListAsync()
        {
            var response = await GetResultAsync<BlogResponse<List<GetAdminCategoryDto>>>("api/meowv/blog/admin/categories");
            return response.Result;
        }

        public async Task DeleteAsync(string id)
        {
            var response = await GetResultAsync<BlogResponse>($"api/meowv/blog/category/{id}", method: HttpMethod.Delete);
            if (response.Success)
            {
                await Message.Success("删除成功", 0.5);
                categories = await GetCategoryListAsync();
            }
            else
            {
                await Message.Error("删除失败");
            }
        }
    }
}