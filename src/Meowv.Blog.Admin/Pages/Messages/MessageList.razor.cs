using AntDesign;
using Meowv.Blog.Dto.Messages;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Newtonsoft.Json;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.Messages
{
    public partial class MessageList
    {
        [CascadingParameter]
        private Task<AuthenticationState> AuthenticationState { get; set; }

        public string MessageId { get; set; }

        public string Avatar { get; set; }

        public string Name { get; set; }

        public string Content { get; set; }

        int page = 1;
        int limit = 10;
        int total = 0;
        IReadOnlyList<MessageDto> messages = new List<MessageDto>();

        protected override async Task OnInitializedAsync()
        {
            messages = await GetMessageListAsync(page, limit);

            var state = await AuthenticationState;
            var user = state.User;

            if (user.Identity.IsAuthenticated)
            {
                Name = user.Claims?.FirstOrDefault(x => x.Type == ClaimTypes.Name).Value;
                Avatar = user.Claims?.FirstOrDefault(x => x.Type == "avatar").Value;
            }
        }

        public async Task<IReadOnlyList<MessageDto>> GetMessageListAsync(int page, int limit)
        {
            var response = await GetResultAsync<BlogResponse<PagedList<MessageDto>>>($"api/meowv/messages/{page}/{limit}");

            total = response.Result.Total;

            return response.Result.Item;
        }

        public async Task HandlePageIndexChange(PaginationEventArgs args)
        {
            messages = await GetMessageListAsync(args.PageIndex, limit);
            StateHasChanged();
        }

        public async Task SubmitMessageAsync()
        {
            if (string.IsNullOrWhiteSpace(Content))
            {
                await Message.Info("请输入留言内容");
                return;
            }

            var json = JsonConvert.SerializeObject(new
            {
                name = Name,
                content = Content,
                avatar = Avatar
            });
            var response = await GetResultAsync<BlogResponse>("api/meowv/message", json, HttpMethod.Post);
            if (response.Success)
            {
                await Message.Success("Successful", 0.5);

                messages = await GetMessageListAsync(page, limit);
            }
            else
            {
                await Message.Error("UnSuccessful");
            }
        }
    }
}