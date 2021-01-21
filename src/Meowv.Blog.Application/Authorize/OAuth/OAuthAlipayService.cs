using Meowv.Blog.Dto.Authorize;
using Meowv.Blog.Extensions;
using Meowv.Blog.Options.Authorize;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.Authorize.OAuth
{
    public class OAuthAlipayService : IOAuthService<AlipayAccessToken, AlipayUserInfo>, ITransientDependency
    {
        private readonly AlipayOptions _alipayOptions;
        private readonly IHttpClientFactory _httpClient;

        public OAuthAlipayService(IOptions<AlipayOptions> alipayOptions, IHttpClientFactory httpClient)
        {
            _alipayOptions = alipayOptions.Value;
            _httpClient = httpClient;
        }

        public async Task<string> GetAuthorizeUrl(string state = "")
        {
            var param = BuildAuthorizeUrlParams(state);
            var url = $"{_alipayOptions.AuthorizeUrl}?{param.ToQueryString()}";

            return await Task.FromResult(url);
        }

        public async Task<AlipayAccessToken> GetAccessTokenAsync(string code, string state = "")
        {
            var param = BuildAccessTokenParams(code, state);

            using var client = _httpClient.CreateClient();
            client.DefaultRequestHeaders.Add("Referer", "https://alipay.com");
            client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 Edg/87.0.664.66");
            client.DefaultRequestHeaders.Add("accept", "application/json");

            var httpResponse = await client.PostAsync(_alipayOptions.AccessTokenUrl, new FormUrlEncodedContent(param));
            var response = await httpResponse.Content.ReadAsStringAsync();

            return response.DeserializeToObject<AlipayAccessToken>();
        }

        public async Task<AlipayUserInfo> GetUserInfoAsync(AlipayAccessToken accessToken)
        {
            var param = BuildUserInfoParams(accessToken.AccessTokenResponse.AccessToken);

            using var client = _httpClient.CreateClient();
            client.DefaultRequestHeaders.Add("Referer", "https://alipay.com");
            client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 Edg/87.0.664.66");
            client.DefaultRequestHeaders.Add("accept", "application/json");

            var httpResponse = await client.PostAsync(_alipayOptions.AccessTokenUrl, new FormUrlEncodedContent(param));
            var response = await httpResponse.Content.ReadAsStringAsync();

            return response.DeserializeToObject<AlipayUserInfo>();
        }

        protected Dictionary<string, string> BuildAuthorizeUrlParams(string state)
        {
            return new Dictionary<string, string>
            {
                ["app_id"] = _alipayOptions.AppId,
                ["redirect_uri"] = _alipayOptions.RedirectUrl,
                ["scope"] = _alipayOptions.Scope,
                ["state"] = state,
            };
        }

        protected Dictionary<string, string> BuildAccessTokenParams(string code, string state)
        {
            var param = new Dictionary<string, string>()
            {
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["state"] = state,
                ["app_id"] = _alipayOptions.AppId,
                ["method"] = "alipay.system.oauth.token",
                ["charset"] = "utf-8",
                ["sign_type"] = "RSA2",
                ["timestamp"] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                ["version"] = "1.0"
            };
            param.Add("sign", param.Sign(_alipayOptions.PrivateKey));

            return param;
        }

        protected Dictionary<string, string> BuildUserInfoParams(string accessToken)
        {
            var param = new Dictionary<string, string>()
            {
                ["auth_token"] = accessToken,
                ["app_id"] = _alipayOptions.AppId,
                ["method"] = "alipay.user.info.share",
                ["charset"] = "utf-8",
                ["sign_type"] = "RSA2",
                ["timestamp"] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                ["version"] = "1.0"
            };
            param.Add("sign", param.Sign(_alipayOptions.PrivateKey));

            return param;
        }
    }
}