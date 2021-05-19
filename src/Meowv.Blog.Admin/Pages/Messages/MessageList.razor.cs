using AntDesign;
using Meowv.Blog.Dto.Messages;
using Meowv.Blog.Dto.Messages.Params;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Newtonsoft.Json;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Threading.Tasks;
using Vditor.Models;

namespace Meowv.Blog.Admin.Pages.Messages
{
    public partial class MessageList
    {
        [CascadingParameter]
        private Task<AuthenticationState> AuthenticationState { get; set; }

        public string UserId { get; set; }

        public string MessageId { get; set; }

        public CreateMessageInput MessageModel = new CreateMessageInput();

        public ReplyMessageInput ReplyMessageModel = new ReplyMessageInput();

        bool visible = false;

        int page = 1;
        int limit = 10;
        int total = 0;
        IReadOnlyList<MessageDto> messages = new List<MessageDto>();

        Toolbar Toolbar = new Toolbar();

        protected override async Task OnInitializedAsync()
        {
            messages = await GetMessageListAsync(page, limit);

            string[] keys = { "emoji", "headings", "bold", "italic", "strike", "link", "|", "list", "ordered-list", "check", "outdent", "indent", "|", "quote", "line", "code", "inline-code", "insert-before", "insert-after", "|", "table", "undo", "redo", "edit-mode", "both", "preview", "outline", "code-theme", "content-theme", "export" };
            Toolbar.Buttons.AddRange(keys.ToList());

            var state = await AuthenticationState;
            var user = state.User;

            if (user.Identity.IsAuthenticated)
            {
                UserId = MessageModel.UserId = ReplyMessageModel.UserId = user.Claims?.FirstOrDefault(x => x.Type == ClaimTypes.NameIdentifier).Value;
                MessageModel.Name = ReplyMessageModel.Name = user.Claims?.FirstOrDefault(x => x.Type == ClaimTypes.Name).Value;
                MessageModel.Avatar = ReplyMessageModel.Avatar = user.Claims?.FirstOrDefault(x => x.Type == "avatar").Value;
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
            messages = await GetMessageListAsync(args.Page, limit);
            StateHasChanged();
        }

        public async Task SubmitMessageAsync()
        {
            if (string.IsNullOrWhiteSpace(MessageModel.Content))
            {
                await Message.Info("请输入留言内容");
                return;
            }

            var json = JsonConvert.SerializeObject(MessageModel);
            var response = await GetResultAsync<BlogResponse>("api/meowv/message", json, HttpMethod.Post);
            if (response.Success)
            {
                await Message.Success("Successful", 0.5);

                messages = await GetMessageListAsync(page, limit);

                MessageModel.Content = "";

                await InvokeAsync(StateHasChanged);
            }
            else
            {
                await Message.Error(response.Message);
            }
        }

        public async Task SubmitReplyMessageAsync()
        {
            if (string.IsNullOrWhiteSpace(ReplyMessageModel.Content))
            {
                await Message.Info("请输入留言内容");
                return;
            }
            var json = JsonConvert.SerializeObject(ReplyMessageModel);
            var response = await GetResultAsync<BlogResponse>($"api/meowv/message/reply/{MessageId}", json, HttpMethod.Post);
            if (response.Success)
            {
                await Message.Success("Successful", 0.5);

                messages = await GetMessageListAsync(page, limit);

                ReplyMessageModel.Content = "";

                visible = false;
            }
            else
            {
                await Message.Error(response.Message);
            }
        }

        private async Task DeleteMessageAsync(string id)
        {
            var response = await GetResultAsync<BlogResponse>($"api/meowv/message/{id}", method: HttpMethod.Delete);
            if (response.Success)
            {
                await Message.Success("Successful", 0.5);

                messages = await GetMessageListAsync(page, limit);
            }
            else
            {
                await Message.Error(response.Message);
            }
        }

        private async Task DeleteReplyMessageAsync(string id, string replyId)
        {
            var response = await GetResultAsync<BlogResponse>($"api/meowv/message/reply/{id}/{replyId}", method: HttpMethod.Delete);
            if (response.Success)
            {
                await Message.Success("Successful", 0.5);

                messages = await GetMessageListAsync(page, limit);
            }
            else
            {
                await Message.Error(response.Message);
            }
        }

        private void Open(string id)
        {
            visible = true;
            MessageId = id;
        }

        private void Close() => visible = false;
    }
}