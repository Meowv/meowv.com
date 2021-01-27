using Newtonsoft.Json;

namespace Meowv.Blog.Dto.Authorize
{
    public class AlipayUserInfo
    {
        [JsonProperty("sign")]
        public string Sign { get; set; }

        [JsonProperty("alipay_user_info_share_response")]
        public AlipayUserInfoResponse UserInfoResponse { get; set; }
    }

    public class AlipayUserInfoResponse
    {
        [JsonProperty("user_id")]
        public string Id { get; set; }

        [JsonProperty("nick_name")]
        public string Name { get; set; }

        [JsonProperty("avatar")]
        public string Avatar { get; set; }

        public string Email { get; set; } = "";
    }
}