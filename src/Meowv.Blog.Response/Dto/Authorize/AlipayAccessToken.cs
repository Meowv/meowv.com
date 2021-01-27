using Newtonsoft.Json;

namespace Meowv.Blog.Dto.Authorize
{
    public class AlipayAccessToken
    {
        [JsonProperty("sign")]
        public string Sign { get; set; }

        [JsonProperty("alipay_system_oauth_token_response")]
        public AlipayAccessTokenResponse AccessTokenResponse { get; set; }
    }

    public class AlipayAccessTokenResponse
    {
        [JsonProperty("access_token")]
        public string AccessToken { get; set; }

        [JsonProperty("alipay_user_id")]
        public string AlipayUserId { get; set; }

        [JsonProperty("expires_in")]
        public int ExpiresIn { get; set; }

        [JsonProperty("re_expires_in")]
        public int ReExpiresIn { get; set; }

        [JsonProperty("refresh_token")]
        public string RefreshToken { get; set; }

        [JsonProperty("user_id")]
        public string UserId { get; set; }
    }
}