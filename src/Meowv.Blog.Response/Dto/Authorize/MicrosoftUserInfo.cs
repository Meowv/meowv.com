using Newtonsoft.Json;

namespace Meowv.Blog.Dto.Authorize
{
    public class MicrosoftUserInfo
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("displayName")]
        public string Name { get; set; }

        public string Avatar { get; set; } = "";

        [JsonProperty("userPrincipalName")]
        public string Email { get; set; }
    }
}