using System;

namespace MeowvBlog.Core.Domain.HotNews
{
    public class HotNews
    {
        public string Id { get; set; }

        public string Title { get; set; }

        public string Url { get; set; }

        public int SourceId { get; set; }

        public DateTime Date { get; set; }
    }
}