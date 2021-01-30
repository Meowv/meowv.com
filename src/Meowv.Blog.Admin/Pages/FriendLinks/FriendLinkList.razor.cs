using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Response;
using Newtonsoft.Json;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.FriendLinks
{
    public partial class FriendLinkList
    {
        List<GetAdminFriendLinkDto> links;

        bool visible = false;

        string friendlinkId;

        UpdateFriendLinkInput input = new UpdateFriendLinkInput();

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

        private void Close() => visible = false;

        private void Open(GetAdminFriendLinkDto dto)
        {
            friendlinkId = dto.Id;
            input.Name = dto.Name;
            input.Url = dto.Url;

            visible = true;
        }

        public async Task HandleSubmit()
        {
            if (string.IsNullOrWhiteSpace(input.Name) || string.IsNullOrWhiteSpace(input.Url))
            {
                return;
            }

            var json = JsonConvert.SerializeObject(input);

            var response = await GetResultAsync<BlogResponse>($"api/meowv/blog/friendlink/{friendlinkId}", json, HttpMethod.Put);
            if (response.Success)
            {
                Close();
                await Message.Success("Successful", 0.5);
                links = await GetFriendLinkListAsync();
            }
            else
            {
                await Message.Error(response.Message);
            }
        }
    }
}