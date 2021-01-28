using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.FriendLinks
{
    public partial class FriendLinkList
    {
        List<GetAdminFriendLinkDto> links;

        protected override async Task OnInitializedAsync()
        {
            links = await GetFriendLinkListAsync();
        }

        public async Task<List<GetAdminFriendLinkDto>> GetFriendLinkListAsync()
        {
            var response = await GetResultAsync<BlogResponse<List<GetAdminFriendLinkDto>>>("api/meowv/blog/admin/friendlinks");
            return response.Result;
        }

        public async Task DeleteAsync(string id)
        {
            var response = await GetResultAsync<BlogResponse>($"api/meowv/blog/friendlink/{id}", method: HttpMethod.Delete);
            if (response.Success)
            {
                await Message.Success("删除成功", 0.5);
                links = await GetFriendLinkListAsync();
            }
            else
            {
                await Message.Error("删除失败");
            }
        }
    }
}