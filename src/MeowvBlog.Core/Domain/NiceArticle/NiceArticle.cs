using System;

namespace MeowvBlog.Core.Domain.NiceArticle
{
    public class NiceArticle
    {
        public int Id { get; set; }

        public string Title { get; set; }

        public string Author { get; set; }

        public string Source { get; set; }

        public string Url { get; set; }

        public int CategoryId { get; set; }

        public DateTime Time { get; set; }
    }
}