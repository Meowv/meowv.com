using Meowv.Blog.Domain.Users;
using Meowv.Blog.Dto.Authorize;
using Meowv.Blog.Extensions;
using Meowv.Blog.Options.Authorize;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web;

namespace Meowv.Blog.Authorize.OAuth.Impl
{
    public class OAuthQQService : OAuthServiceBase<QQOptions, AccessTokenBase, QQUserInfo>
    {
        public override async Task<string> GetAuthorizeUrl(string state)
        {
            var param = BuildAuthorizeUrlParams(state);
            var url = $"{Options.Value.AuthorizeUrl}?{param.ToQueryString()}";

            return await Task.FromResult(url);
        }

        public override async Task<User> GetUserByOAuthAsync(string type, string code, string state)
        {
            var accessToken = await GetAccessTokenAsync(code, state);
            var userInfo = await GetUserInfoAsync(accessToken);

            return await UserService.CreateUserAsync(userInfo.Name, type, userInfo.Id, userInfo.Name, userInfo.Avatar, userInfo.Email);
        }

        public override async Task<AccessTokenBase> GetAccessTokenAsync(string code, string state)
        {
            var param = BuildAccessTokenParams(code, state);
            Options.Value.AccessTokenUrl = $"{Options.Value.AccessTokenUrl}?{param.ToQueryString()}";

            using var client = HttpClient.CreateClient();
            var response = await client.GetStringAsync(Options.Value.AccessTokenUrl);

            var qscoll = HttpUtility.ParseQueryString(response);

            return new AccessTokenBase
            {
                AccessToken = qscoll["access_token"]
            };
        }

        public override async Task<QQUserInfo> GetUserInfoAsync(AccessTokenBase accessToken)
        {
            using var client = HttpClient.CreateClient();

            var openIdResponse = await client.GetStringAsync($"{Options.Value.OpenIdUrl}?access_token={accessToken.AccessToken}&fmt=json");
            var openId = openIdResponse.DeserializeToObject<QQOpenId>().OpenId;

            var param = BuildUserInfoParams(accessToken.AccessToken, openId);
            Options.Value.UserInfoUrl = $"{Options.Value.UserInfoUrl}?{param.ToQueryString()}";

            var response = await client.GetStringAsync(Options.Value.UserInfoUrl);

            var userInfo = response.DeserializeToObject<QQUserInfo>();
            userInfo.Id = openId;
            
            return userInfo;
        }

        protected Dictionary<string, string> BuildAuthorizeUrlParams(string state)
        {
            return new Dictionary<string, string>
            {
                ["client_id"] = Options.Value.ClientId,
                ["response_type"] = "code",
                ["redirect_uri"] = Options.Value.RedirectUrl,
                ["scope"] = Options.Value.Scope,
                ["state"] = state
            };
        }

        protected Dictionary<string, string> BuildAccessTokenParams(string code, string state)
        {
            return new Dictionary<string, string>()
            {
                ["client_id"] = Options.Value.ClientId,
                ["client_secret"] = Options.Value.ClientSecret,
                ["grant_type"] = "authorization_code",
                ["redirect_uri"] = Options.Value.RedirectUrl,
                ["code"] = code,
                ["state"] = state
            };
        }

        protected Dictionary<string, string> BuildUserInfoParams(string accessToken, string openId)
        {
            return new Dictionary<string, string>()
            {
                ["access_token"] = accessToken,
                ["oauth_consumer_key"] = Options.Value.ClientId,
                ["openid"] = openId,
            };
        }
    }
}