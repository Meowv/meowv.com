using Newtonsoft.Json;

namespace Meowv.Blog.Dto.Authorize
{
    public class AlipayUserInfo
    {
        [JsonProperty("user_id")]
        public string Id { get; set; }

        [JsonProperty("nick_name")]
        public string Name { get; set; }

        [JsonProperty("avatar")]
        public string Avatar { get; set; }
    }
}