using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Components;
using Newtonsoft.Json;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.FriendLinks
{
    public partial class FriendLinkAdd
    {
        CreateFriendLinkInput input = new CreateFriendLinkInput();

        public async Task HandleSubmit()
        {
            if (string.IsNullOrWhiteSpace(input.Name) || string.IsNullOrWhiteSpace(input.Url))
            {
                return;
            }

            var json = JsonConvert.SerializeObject(input);

            var response = await GetResultAsync<BlogResponse>("api/meowv/blog/friendlink", json, HttpMethod.Post);
            if (response.Success)
            {
                await Message.Success("Successful", 0.5);
                NavigationManager.NavigateTo("/friendlinks/list");
            }
            else
            {
                await Message.Error(response.Message);
            }
        }
    }
}