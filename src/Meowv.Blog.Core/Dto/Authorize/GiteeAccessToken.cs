using System.Text.Json.Serialization;

namespace Meowv.Blog.Dto.Authorize
{
    public class GiteeAccessToken : AccessTokenBase
    {
        [JsonPropertyName("refresh_token")]
        public string RefreshToken { get; set; }

        [JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }

        [JsonPropertyName("created_at")]
        public int CreatedAt { get; set; }
    }
}