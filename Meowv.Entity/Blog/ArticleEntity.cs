using Meowv.Entity.Common;
using System;

namespace Meowv.Entity.Blog
{
    public class ArticleEntity : CommonEntity
    {
        public int ArticleId { get; set; }

        public int Title { get; set; }

        public string Url { get; set; }

        public string Content { get; set; }

        public DateTime PostTime { get; set; }
    }
}