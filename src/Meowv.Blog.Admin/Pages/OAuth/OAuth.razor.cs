using AntDesign;
using Meowv.Blog.Admin.Services;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.JSInterop;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.OAuth
{
    public partial class OAuth
    {
        [Parameter]
        public string Type { get; set; }

        [Inject]
        public AuthenticationStateProvider AuthenticationStateProvider { get; set; }

        [Inject] public NotificationService Notification { get; set; }

        protected override async Task OnInitializedAsync()
        {
            var uri = NavigationManager.ToAbsoluteUri(NavigationManager.Uri);

            var hasCode = QueryHelpers.ParseQuery(uri.Query).TryGetValue("code", out Microsoft.Extensions.Primitives.StringValues code);
            if (Type == "alipay")
            {
                hasCode = QueryHelpers.ParseQuery(uri.Query).TryGetValue("auth_code", out code);
            }
            var hasState = QueryHelpers.ParseQuery(uri.Query).TryGetValue("state", out Microsoft.Extensions.Primitives.StringValues state);

            if (hasCode && hasState)
            {
                var response = await GetResultAsync<BlogResponse<string>>($"api/meowv/oauth/{Type}/token?code={code}&state={state}");

                if (response.Success)
                {
                    var token = response.Result;
                    await Js.InvokeVoidAsync("localStorage.setItem", "token", token);

                    NavigationManager.NavigateTo("/", true);
                }
                else
                {
                    await Notification.Warning(new NotificationConfig
                    {
                        Message = response.Message,
                        Description = "Sorry, this account is not authorized, please contact 阿星Plus"
                    });
                    NavigationManager.NavigateTo("/login", true);
                }
            }
            else
            {
                var service = AuthenticationStateProvider as OAuthService;
                await service.GetOAuthUrl(Type);
            }
        }
    }
}