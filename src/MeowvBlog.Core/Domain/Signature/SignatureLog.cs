using System;

namespace MeowvBlog.Core.Domain.Signature
{
    public class SignatureLog
    {
        public int Id { get; set; }

        public string Name { get; set; }

        public string Type { get; set; }

        public string Url { get; set; }

        public string Ip { get; set; }

        public DateTime Time { get; set; }
    }
}