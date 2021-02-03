using Newtonsoft.Json;

namespace Meowv.Blog.Dto.Authorize
{
    public class WeiboAccessToken
    {
        [JsonProperty("access_token")]
        public string AccessToken { get; set; }

        [JsonProperty("uid")]
        public virtual string Uid { get; set; }
    }
}