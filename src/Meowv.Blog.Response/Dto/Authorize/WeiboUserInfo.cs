using Newtonsoft.Json;

namespace Meowv.Blog.Dto.Authorize
{
    public class WeiboUserInfo
    {
        [JsonProperty("idstr")]
        public string Id { get; set; }

        [JsonProperty("screen_name")]
        public string Login { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("avatar_large")]
        public string Avatar { get; set; }

        public string Email { get; set; } = "";
    }
}