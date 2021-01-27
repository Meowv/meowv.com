using Newtonsoft.Json;

namespace Meowv.Blog.Dto.Authorize
{
    public class AccessTokenBase
    {
        [JsonProperty("access_token")]
        public string AccessToken { get; set; }

        [JsonProperty("scope")]
        public string Scope { get; set; }

        [JsonProperty("token_type")]
        public string TokenType { get; set; }
    }
}