using Meowv.Blog.Dto.Authorize.OAuth;
using Meowv.Blog.Extensions;
using Meowv.Blog.Options.Authorize;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Authorize.OAuth
{
    public class OAuthGithubService : IOAuthService<string, GithubUserInfo>, ITransientDependency
    {
        private readonly GithubOptions _githubOptions;

        public OAuthGithubService(IOptions<GithubOptions> githubOptions) => _githubOptions = githubOptions.Value;

        public async Task<string> GetAuthorizeUrl(string state = "")
        {
            var param = BuildAuthorizeUrlParams(state);
            var url = $"{_githubOptions.AuthorizeUrl}{(_githubOptions.AuthorizeUrl.Contains("?") ? "&" : "?")}{param.ToQueryString()}";

            return await Task.FromResult(url);
        }

        public Task<string> GetAccessTokenAsync(string code, string state = "")
        {
            throw new NotImplementedException();
        }

        public Task<GithubUserInfo> GetUserInfoAsync(string accessToke)
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
    }
}