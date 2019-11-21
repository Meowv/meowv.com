using System;

namespace MeowvBlog.API.Models.Entity.Signature
{
    public class SignatureLog
    {
        public int Id { get; set; }

        public string Name { get; set; }

        public string Type { get; set; }

        public string Url { get; set; }

        public string Ip { get; set; }

        public DateTime Date { get; set; }
    }
}