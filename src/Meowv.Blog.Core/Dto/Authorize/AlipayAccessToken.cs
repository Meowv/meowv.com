using Newtonsoft.Json;

namespace Meowv.Blog.Dto.Authorize
{
    public class AlipayAccessToken : AccessTokenBase
    {
        [JsonProperty("user_id")]
        public string UserId { get; set; }

        [JsonProperty("code")]
        public string Code { get; set; }

        [JsonProperty("error_response")]
        public string ErrorResponse { get; set; }

        [JsonProperty("sub_code")]
        public string SubCode { get; set; }

        [JsonProperty("sub_msg")]
        public string SubMsg { get; set; }
    }
}