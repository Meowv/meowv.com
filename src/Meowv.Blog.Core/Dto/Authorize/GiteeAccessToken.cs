using Newtonsoft.Json;

namespace Meowv.Blog.Dto.Authorize
{
    public class GiteeAccessToken : AccessTokenBase
    {
        [JsonProperty("refresh_token")]
        public string RefreshToken { get; set; }

        [JsonProperty("expires_in")]
        public int ExpiresIn { get; set; }

        [JsonProperty("created_at")]
        public int CreatedAt { get; set; }
    }
}