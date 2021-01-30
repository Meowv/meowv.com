using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Response;
using Newtonsoft.Json;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.Tags
{
    public partial class TagList
    {
        List<GetAdminTagDto> tags;

        bool visible = false;

        string tagId;

        UpdateTagInput input = new UpdateTagInput();

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
                await Message.Success("Successful", 0.5);
                tags = await GetTagListAsync();
            }
            else
            {
                await Message.Error(response.Message);
            }
        }

        private void Close() => visible = false;

        private void Open(GetAdminTagDto dto)
        {
            tagId = dto.Id;
            input.Name = dto.Name;
            input.Alias = dto.Alias;

            visible = true;
        }

        public async Task HandleSubmit()
        {
            if (string.IsNullOrWhiteSpace(input.Name) || string.IsNullOrWhiteSpace(input.Alias))
            {
                return;
            }

            var json = JsonConvert.SerializeObject(input);

            var response = await GetResultAsync<BlogResponse>($"api/meowv/blog/tag/{tagId}", json, HttpMethod.Put);
            if (response.Success)
            {
                Close();
                await Message.Success("Successful", 0.5);
                tags = await GetTagListAsync();
            }
            else
            {
                await Message.Error(response.Message);
            }
        }
    }
}