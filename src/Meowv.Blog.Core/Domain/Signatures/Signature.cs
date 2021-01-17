using System;

namespace Meowv.Blog.Domain.Signatures
{
    public class Signature : EntityBase
    {
        public string Name { get; set; }

        public string Type { get; set; }

        public string Url { get; set; }

        public string Ip { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}