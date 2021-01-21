using Meowv.Blog.Domain.Users;
using Meowv.Blog.Dto.Authorize;
using Meowv.Blog.Extensions;
using Meowv.Blog.Options.Authorize;
using Meowv.Blog.Users;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Authorize.OAuth
{
    public class OAuthDingtalkService : IOAuthService<string, DingTalkUserInfo>, ITransientDependency
    {
        private readonly DingtalkOptions _dingtalkOptions;
        private readonly IHttpClientFactory _httpClient;
        private readonly IUserService _userService;

        public OAuthDingtalkService(IOptions<DingtalkOptions> dingtalkOptions, IHttpClientFactory httpClient, IUserService userService)
        {
            _dingtalkOptions = dingtalkOptions.Value;
            _httpClient = httpClient;
            _userService = userService;
        }

        public async Task<string> GetAuthorizeUrl(string state = "")
        {
            var param = BuildAuthorizeUrlParams(state);
            var url = $"{_dingtalkOptions.AuthorizeUrl}?{param.ToQueryString()}";

            return await Task.FromResult(url);
        }

        public async Task<User> GetUserByOAuthAsync(string type, string code, string state)
        {
            var accessToken = await GetAccessTokenAsync(code, state);
            var userInfo = await GetUserInfoAsync(accessToken);

            return await _userService.CreateUserAsync(userInfo.UserInfoResponse.Name, type, userInfo.UserInfoResponse.Id, userInfo.UserInfoResponse.Name, userInfo.UserInfoResponse.Avatar, userInfo.UserInfoResponse.Email);
        }

        public async Task<string> GetAccessTokenAsync(string code, string state = "")
        {
            return await Task.FromResult(code);
        }

        public async Task<DingTalkUserInfo> GetUserInfoAsync(string accessToken)
        {
            var param = BuildUserInfoParams();
            _dingtalkOptions.UserInfoUrl = $"{_dingtalkOptions.UserInfoUrl}?{param.ToQueryStringWithEncode()}";

            var json = new { tmp_auth_code = accessToken }.SerializeToJson();

            var content = new ByteArrayContent(json.GetBytes());
            content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

            using var client = _httpClient.CreateClient();
            var httpResponse = await client.PostAsync(_dingtalkOptions.UserInfoUrl, content);

            var response = await httpResponse.Content.ReadAsStringAsync();

            return response.DeserializeToObject<DingTalkUserInfo>();
        }

        protected Dictionary<string, string> BuildAuthorizeUrlParams(string state)
        {
            return new Dictionary<string, string>
            {
                ["appid"] = _dingtalkOptions.AppId,
                ["response_type"] = "code",
                ["redirect_uri"] = _dingtalkOptions.RedirectUrl,
                ["scope"] = _dingtalkOptions.Scope,
                ["state"] = state,
            };
        }

        protected Dictionary<string, string> BuildUserInfoParams()
        {
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
            var sign = timestamp.Sign(_dingtalkOptions.AppSecret);

            return new Dictionary<string, string>
            {
                ["accessKey"] = _dingtalkOptions.AppId,
                ["timestamp"] = timestamp,
                ["signature"] = sign
            };
        }
    }
}