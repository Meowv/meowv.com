using Meowv.Blog.Dto.Authorize;
using Meowv.Blog.Extensions;
using Meowv.Blog.Options.Authorize;
using Microsoft.Extensions.Options;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using System.Web;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Authorize.OAuth
{
    public class OAuthGithubService : IOAuthService<GithubAccessToken, GithubUserInfo>, ITransientDependency
    {
        private readonly GithubOptions _githubOptions;
        private readonly IHttpClientFactory _httpClient;

        public OAuthGithubService(IOptions<GithubOptions> githubOptions, IHttpClientFactory httpClient)
        {
            _githubOptions = githubOptions.Value;
            _httpClient = httpClient;
        }

        public async Task<string> GetAuthorizeUrl(string state = "")
        {
            var param = BuildAuthorizeUrlParams(state);
            var url = $"{_githubOptions.AuthorizeUrl}?{param.ToQueryString()}";

            return await Task.FromResult(url);
        }

        public async Task<GithubAccessToken> GetAccessTokenAsync(string code, string state = "")
        {
            var param = BuildAccessTokenParams(code, state);

            var content = new StringContent(param.ToQueryString());
            content.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");

            using var client = _httpClient.CreateClient();
            var httpResponse = await client.PostAsync(_githubOptions.AccessTokenUrl, content);

            var response = await httpResponse.Content.ReadAsStringAsync();

            var qscoll = HttpUtility.ParseQueryString(response);

            return new GithubAccessToken
            {
                AccessToken = qscoll["access_token"],
                Scope = qscoll["scope"],
                TokenType = qscoll["token_type"]
            };
        }

        public async Task<GithubUserInfo> GetUserInfoAsync(GithubAccessToken accessToke)
        {
            using var client = _httpClient.CreateClient();
            client.DefaultRequestHeaders.Add("Authorization", $"token {accessToke.AccessToken}");
            client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 Edg/87.0.664.66");

            var response = await client.GetStringAsync(_githubOptions.UserInfoUrl);

            var userInfo = response.DeserializeToObject<GithubUserInfo>();
            return userInfo;
        }

        protected Dictionary<string, string> BuildAuthorizeUrlParams(string state)
        {
            return new Dictionary<string, string>
            {
                ["client_id"] = _githubOptions.ClientId,
                ["redirect_uri"] = _githubOptions.RedirectUrl,
                ["scope"] = _githubOptions.Scope,
                ["state"] = state
            }.RemoveDictionaryEmptyItems();
        }

        protected Dictionary<string, string> BuildAccessTokenParams(string code, string state)
        {
            return new Dictionary<string, string>()
            {
                ["client_id"] = _githubOptions.ClientId,
                ["client_secret"] = _githubOptions.ClientSecret,
                ["redirect_uri"] = _githubOptions.RedirectUrl,
                ["code"] = code,
                ["state"] = state
            };
        }
    }
}