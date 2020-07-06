using Newtonsoft.Json;

namespace Meowv.Blog.Application.Contracts.Common
{
    public class EmojiJsonDto
    {
        public string[] Keywords { get; set; }

        public string Char { get; set; }

        [JsonProperty(PropertyName = "fitzpatrick_scale")]
        public bool FitzpatrickScale { get; set; }

        public string Category { get; set; }
    }
}