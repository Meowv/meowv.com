using System.Collections.Generic;

namespace Meowv.Blog.Options
{
    public class SignatureOptions
    {
        public string Path { get; set; }

        public Dictionary<string, string> Urls { get; set; } = new Dictionary<string, string>();
    }
}