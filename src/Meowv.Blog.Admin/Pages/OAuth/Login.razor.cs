using AntDesign;
using Meowv.Blog.Admin.Services;
using Meowv.Blog.Dto.Authorize.Params;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.OAuth
{
    public partial class Login
    {
        private readonly LoginInput model = new LoginInput();

        [Inject] public NavigationManager NavigationManager { get; set; }

        [Inject] public NotificationService Notification { get; set; }

        [Inject] public AuthenticationStateProvider AuthenticationStateProvider { get; set; }

        [Inject] public IHttpClientFactory HttpClient { get; set; }

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

        public async Task HandleClick(string type)
        {
            if (type == "qq")
            {
                await Notification.Info(new NotificationConfig
                {
                    Message = "NotImplemented",
                    Description = "The oauth for qq is not implemented."
                });
                return;
            }

            NavigationManager.NavigateTo($"/oauth/{type}");
            return;
        }

        public void OnChange(string activeKey)
        {
            model.Type = activeKey;
        }

        public async Task GetAuthCode()
        {
            loading = true;

            var http = HttpClient.CreateClient("api");

            var httpResponse = await http.PostAsync("api/meowv/oauth/code/send", null);
            if (httpResponse.IsSuccessStatusCode)
            {
                await Notification.Success(new NotificationConfig
                {
                    Message = "Successful",
                    Description = "The dynamic code has been sent to WeChat."
                });
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