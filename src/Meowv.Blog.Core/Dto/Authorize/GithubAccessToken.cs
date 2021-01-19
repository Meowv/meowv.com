using System.Text.Json.Serialization;

namespace Meowv.Blog.Dto.Authorize
{
    public class GithubAccessToken
    {
        [JsonPropertyName("access_token")]
        public virtual string AccessToken { get; set; }

        [JsonPropertyName("scope")]
        public virtual string Scope { get; set; }

        [JsonPropertyName("token_type")]
        public virtual string TokenType { get; set; }
    }
}