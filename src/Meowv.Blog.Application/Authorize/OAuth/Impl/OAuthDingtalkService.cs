using Meowv.Blog.Domain.Users;
using Meowv.Blog.Dto.Authorize;
using Meowv.Blog.Extensions;
using Meowv.Blog.Options.Authorize;
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;

namespace Meowv.Blog.Authorize.OAuth.Impl
{
    public class OAuthDingtalkService : OAuthServiceBase<DingtalkOptions, string, DingTalkUserInfo>
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

            return await UserService.CreateUserAsync(userInfo.UserInfoResponse.Name, type, userInfo.UserInfoResponse.Id, userInfo.UserInfoResponse.Name, userInfo.UserInfoResponse.Avatar, userInfo.UserInfoResponse.Email);
        }

        public override async Task<string> GetAccessTokenAsync(string code, string state)
        {
            return await Task.FromResult(code);
        }

        public override async Task<DingTalkUserInfo> GetUserInfoAsync(string accessToken)
        {
            var param = BuildUserInfoParams();
            Options.Value.UserInfoUrl = $"{Options.Value.UserInfoUrl}?{param.ToQueryStringWithEncode()}";

            var json = new { tmp_auth_code = accessToken }.SerializeToJson();

            var content = new ByteArrayContent(json.GetBytes());
            content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

            using var client = HttpClient.CreateClient();
            var httpResponse = await client.PostAsync(Options.Value.UserInfoUrl, content);

            var response = await httpResponse.Content.ReadAsStringAsync();

            return response.DeserializeToObject<DingTalkUserInfo>();
        }

        protected Dictionary<string, string> BuildAuthorizeUrlParams(string state)
        {
            return new Dictionary<string, string>
            {
                ["appid"] = Options.Value.AppId,
                ["response_type"] = "code",
                ["redirect_uri"] = Options.Value.RedirectUrl,
                ["scope"] = Options.Value.Scope,
                ["state"] = state,
            };
        }

        protected Dictionary<string, string> BuildUserInfoParams()
        {
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
            var sign = timestamp.Sign(Options.Value.AppSecret);

            return new Dictionary<string, string>
            {
                ["accessKey"] = Options.Value.AppId,
                ["timestamp"] = timestamp,
                ["signature"] = sign
            };
        }
    }
}