using Newtonsoft.Json;

namespace Meowv.Blog.Dto.Authorize
{
    public class UserInfoBase
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("email")]
        public string Email { get; set; }
    }
}