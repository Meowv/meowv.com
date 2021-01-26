using AntDesign;
using Meowv.Blog.Admin.Models;
using Meowv.Blog.Admin.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.OAuth
{
    public partial class Login
    {
        private readonly LoginModel model = new LoginModel() { Type = "account" };

        [Inject] public NavigationManager NavigationManager { get; set; }

        [Inject] public NotificationService Notification { get; set; }

        [Inject] public AuthenticationStateProvider AuthenticationStateProvider { get; set; }

        bool loading = false;

        public async Task HandleSubmit()
        {
            var service = AuthenticationStateProvider as OAuthService;

            var token = await service.GetTokenAsync(model);

            if (string.IsNullOrEmpty(token))
            {
                await Notification.Warn(new NotificationConfig
                {
                    Message = "UnAuthorized",
                    Description = "The username or password entered is incorrect."
                });
            }
            else
            {
                NavigationManager.NavigateTo("/", true);
            }
            return;
        }

        public void OnChange(string activeKey)
        {
            model.Type = activeKey;
        }

        public async Task GetCode()
        {
            loading = true;

            await Notification.Success(new NotificationConfig
            {
                Message = "Successful",
                Description = "The dynamic code has been sent to WeChat."
            });

            await Task.Run(async () =>
            {
                await Task.Delay(8000);
                loading = false;
                await InvokeAsync(StateHasChanged);
            });
        }
    }
}