using Plus.Domain.Entities;
using System;

namespace MeowvBlog.Core.Domain.HotNews
{
    public class HotNews : Entity<string>
    {
        public string Title { get; set; }

        public string Url { get; set; }

        public int SourceId { get; set; }

        public DateTime Time { get; set; }
    }
}