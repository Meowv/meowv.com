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

        public async Task HandleSubmit()
        {
            var service = AuthenticationStateProvider as OAuthService;

            var token = await service.GetTokenAsync(model);

            if (string.IsNullOrEmpty(token))
            {
                await Notification.Error(new NotificationConfig
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
        }
    }
}