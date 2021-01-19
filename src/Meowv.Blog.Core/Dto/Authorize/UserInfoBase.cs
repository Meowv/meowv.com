using System.Text.Json.Serialization;

namespace Meowv.Blog.Dto.Authorize
{
    public class UserInfoBase
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("email")]
        public string Email { get; set; }
    }
}