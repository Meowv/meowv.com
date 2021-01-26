using Meowv.Blog.Admin.Models;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.JSInterop;
using Newtonsoft.Json;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;

namespace Meowv.Blog.Admin.Services
{
    public class OAuthService : AuthenticationStateProvider
    {
        private readonly HttpClient http;
        private readonly IJSRuntime _jsRuntime;
        private NavigationManager _navigationManager;

        public OAuthService(IHttpClientFactory httpClientFactory, IJSRuntime jsRuntime, NavigationManager navigationManager)
        {
            http = httpClientFactory.CreateClient("api");
            _jsRuntime = jsRuntime;
            _navigationManager = navigationManager;
        }

        public override async Task<AuthenticationState> GetAuthenticationStateAsync()
        {
            var token = await _jsRuntime.InvokeAsync<string>("window.func.getStorage", "token");

            if (string.IsNullOrEmpty(token))
            {
                return GetNullState();
            }
            else
            {
                http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
                var httpResponseMessage = await http.GetAsync("api/meowv/user");
                if (!httpResponseMessage.IsSuccessStatusCode)
                {
                    return GetNullState();
                }

                var response = await httpResponseMessage.Content.ReadAsStringAsync();

                var user = JsonConvert.DeserializeObject<BlogResponse<UserModel>>(response).Result;

                var identity = new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, user.Id),
                    new Claim(ClaimTypes.Name, user.Name),
                    new Claim(ClaimTypes.Email, user.Email),
                    new Claim("avatar", user.Avatar),
                }, "meowv.blog oauth");

                var principal = new ClaimsPrincipal(identity);

                return new AuthenticationState(principal);
            }

            AuthenticationState GetNullState()
            {
                _navigationManager.NavigateTo("/login");

                var principal = new ClaimsPrincipal(new ClaimsIdentity());
                return new AuthenticationState(principal);
            }
        }

        public async Task<string> GetTokenAsync(LoginModel login)
        {
            var token = string.Empty;

            if (login.Type == "account")
            {
                var json = JsonConvert.SerializeObject(new
                {
                    username = login.Username,
                    password = login.Password
                });
                var content = new ByteArrayContent(Encoding.UTF8.GetBytes(json));
                content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

                var httpResponse = await http.PostAsync("api/meowv/oauth/account/token", content);
                var response = await httpResponse.Content.ReadAsStringAsync();

                token = JsonConvert.DeserializeObject<BlogResponse<string>>(response).Result;

                await _jsRuntime.InvokeVoidAsync("window.func.setStorage", "token", token);
            }
            else if (login.Type == "code")
            {

            }
            else
            {

            }

            return token;
        }
    }
}