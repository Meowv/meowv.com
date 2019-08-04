using System;

namespace MeowvBlog.Services.Dto.Signature
{
    public class SignatureDto
    {
        public string Name { get; set; }

        public string Type { get; set; }

        public string Url { get; set; }

        public string Ip { get; set; }

        public DateTime Time { get; set; }
    }
}