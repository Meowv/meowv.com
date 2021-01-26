using AntDesign;
using Meowv.Blog.Admin.Services;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.JSInterop;
using Newtonsoft.Json;
using System.Net.Http;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Pages.OAuth
{
    public partial class OAuth
    {
        [Parameter]
        public string Type { get; set; }

        [Inject]
        public AuthenticationStateProvider AuthenticationStateProvider { get; set; }

        [Inject]
        public NavigationManager NavigationManager { get; set; }

        [Inject] public NotificationService Notification { get; set; }

        [Inject]
        public IHttpClientFactory ClientFactory { get; set; }

        [Inject]
        public IJSRuntime JSRuntime { get; set; }

        protected override async Task OnInitializedAsync()
        {
            var uri = NavigationManager.ToAbsoluteUri(NavigationManager.Uri);

            var hasCode = QueryHelpers.ParseQuery(uri.Query).TryGetValue("code", out Microsoft.Extensions.Primitives.StringValues code);
            var hasState = QueryHelpers.ParseQuery(uri.Query).TryGetValue("state", out Microsoft.Extensions.Primitives.StringValues state);

            if (hasCode && hasState)
            {
                var http = ClientFactory.CreateClient("api");

                var json = await http.GetStringAsync($"api/meowv/oauth/{Type}/token?code={code}&state={state}");
                var response = JsonConvert.DeserializeObject<BlogResponse<string>>(json);
                if (response.Success)
                {
                    var token = response.Result;
                    await JSRuntime.InvokeVoidAsync("window.func.setStorage", "token", token);

                    NavigationManager.NavigateTo("/", true);
                }
                else
                {
                    await Notification.Warning(new NotificationConfig
                    {
                        Message = "UnAuthorized",
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