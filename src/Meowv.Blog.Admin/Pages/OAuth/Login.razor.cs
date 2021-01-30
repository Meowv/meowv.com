using AntDesign;
using Meowv.Blog.Admin.Services;
using Meowv.Blog.Dto.Authorize.Params;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.OAuth
{
    public partial class Login
    {
        private readonly LoginInput model = new LoginInput();

        [Inject] public NotificationService Notification { get; set; }

        [Inject] public AuthenticationStateProvider AuthenticationStateProvider { get; set; }

        bool loading = false;

        public async Task HandleSubmit()
        {
            var desc = "The username or password entered is incorrect.";

            if (model.Type == "code")
            {
                desc = "The code entered is incorrect.";

                if (string.IsNullOrWhiteSpace(model.Code))
                {
                    return;
                }
            }
            else
            {
                if (string.IsNullOrWhiteSpace(model.Username) || string.IsNullOrWhiteSpace(model.Password))
                {
                    return;
                }
            }

            var service = AuthenticationStateProvider as OAuthService;

            var token = await service.GetTokenAsync(model);

            if (string.IsNullOrEmpty(token))
            {
                await Notification.Warning(new NotificationConfig
                {
                    Message = "UnAuthorized",
                    Description = desc
                });
            }
            else
            {
                await Notification.Success(new NotificationConfig
                {
                    Message = "Successful",
                    Description = $"Login is successful, welcome back.",
                    Duration = 0.5
                });
                NavigationManager.NavigateTo("/", true);
            }
        }

        public void HandleClick(string type)
        {
            NavigationManager.NavigateTo($"/oauth/{type}");
        }

        public void OnChange(string activeKey)
        {
            model.Type = activeKey;
        }

        public async Task GetAuthCode()
        {
            loading = true;

            var response = await GetResultAsync<BlogResponse>("api/meowv/oauth/code/send", method: HttpMethod.Post);
            if (response.Success)
            {
                await Notification.Success(new NotificationConfig
                {
                    Message = "Successful",
                    Description = "The dynamic code has been sent to WeChat."
                });
            }
            else
            {
                await Message.Error(response.Message);
            }

            await Task.Run(async () =>
            {
                await Task.Delay(8000);
                loading = false;
                await InvokeAsync(StateHasChanged);
            });
        }
    }
}