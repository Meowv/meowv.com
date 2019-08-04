using Plus.Domain.Entities;
using System;

namespace MeowvBlog.Core.Domain.Signature
{
    public class SignatureLog : Entity
    {
        public string Name { get; set; }

        public string Type { get; set; }

        public string Url { get; set; }

        public string Ip { get; set; }

        public DateTime Time { get; set; }
    }
}