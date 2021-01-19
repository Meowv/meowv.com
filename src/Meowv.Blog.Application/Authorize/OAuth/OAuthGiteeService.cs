using Meowv.Blog.Dto.Authorize;
using Meowv.Blog.Extensions;
using Meowv.Blog.Options.Authorize;
using Microsoft.Extensions.Options;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Authorize.OAuth
{
    public class OAuthGiteeService : IOAuthService<GiteeAccessToken, UserInfoBase>, ITransientDependency
    {
        private readonly GiteeOptions _giteeOptions;
        private readonly IHttpClientFactory _httpClient;

        public OAuthGiteeService(IOptions<GiteeOptions> giteeOptions, IHttpClientFactory httpClient)
        {
            _giteeOptions = giteeOptions.Value;
            _httpClient = httpClient;
        }

        public async Task<string> GetAuthorizeUrl(string state = "")
        {
            var param = BuildAuthorizeUrlParams(state);
            var url = $"{_giteeOptions.AuthorizeUrl}?{param.ToQueryString()}";

            return await Task.FromResult(url);
        }

        public async Task<GiteeAccessToken> GetAccessTokenAsync(string code, string state = "")
        {
            var param = BuildAccessTokenParams(code, state);

            var content = new StringContent(param.ToQueryString());
            content.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");

            using var client = _httpClient.CreateClient();
            var httpResponse = await client.PostAsync(_giteeOptions.AccessTokenUrl, content);

            var response = await httpResponse.Content.ReadAsStringAsync();

            return response.DeserializeToObject<GiteeAccessToken>();
        }

        public async Task<UserInfoBase> GetUserInfoAsync(GiteeAccessToken accessToken)
        {
            using var client = _httpClient.CreateClient();
            client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 Edg/87.0.664.66");

            var response = await client.GetStringAsync($"{_giteeOptions.UserInfoUrl}?access_token={accessToken.AccessToken}");

            var userInfo = response.DeserializeToObject<UserInfoBase>();
            return userInfo;
        }

        protected Dictionary<string, string> BuildAuthorizeUrlParams(string state)
        {
            return new Dictionary<string, string>
            {
                ["client_id"] = _giteeOptions.ClientId,
                ["redirect_uri"] = _giteeOptions.RedirectUrl,
                ["scope"] = _giteeOptions.Scope,
                ["state"] = state,
                ["response_type"] = "code",
            };
        }

        protected Dictionary<string, string> BuildAccessTokenParams(string code, string state)
        {
            return new Dictionary<string, string>()
            {
                ["client_id"] = _giteeOptions.ClientId,
                ["client_secret"] = _giteeOptions.ClientSecret,
                ["redirect_uri"] = _giteeOptions.RedirectUrl,
                ["code"] = code,
                ["state"] = state,
                ["grant_type"] = "authorization_code"
            };
        }
    }
}