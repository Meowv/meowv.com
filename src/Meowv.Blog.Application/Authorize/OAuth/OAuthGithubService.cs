using Meowv.Blog.Dto.Authorize.OAuth;
using Meowv.Blog.Extensions;
using Meowv.Blog.Options.Authorize;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Authorize.OAuth
{
    public class OAuthGithubService : IOAuthService<GithubAccessToken, GithubUserInfo>, ITransientDependency
    {
        private readonly GithubOptions _githubOptions;
        private readonly IHttpClientFactory _httpClient;

        public OAuthGithubService(IOptions<GithubOptions> githubOptions,
                                  IHttpClientFactory httpClient)
        {
            _githubOptions = githubOptions.Value;
            _httpClient = httpClient;
        }

        public async Task<string> GetAuthorizeUrl(string state = "")
        {
            var param = BuildAuthorizeUrlParams(state);
            var url = $"{_githubOptions.AuthorizeUrl}{(_githubOptions.AuthorizeUrl.Contains("?") ? "&" : "?")}{param.ToQueryString()}";

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

            return null;
        }

        public Task<GithubUserInfo> GetUserInfoAsync(GithubAccessToken accessToke)
        {
            throw new NotImplementedException();
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