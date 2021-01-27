using Newtonsoft.Json;

namespace Meowv.Blog.Dto.Authorize
{
    public class DingTalkUserInfo
    {
        [JsonProperty("user_info")]
        public DingTalkUserInfoResponse UserInfoResponse { get; set; }

        [JsonProperty("errmsg")]
        public string ErrMsg { get; set; }

        [JsonProperty("errcode")]
        public int ErrCode { get; set; }
    }

    public class DingTalkUserInfoResponse
    {
        [JsonProperty("unionid")]
        public string Id { get; set; }

        [JsonProperty("nick")]
        public string Name { get; set; }

        public string Avatar { get; set; } = "";

        public string Email { get; set; } = "";
    }
}