using Meowv.Entity.Common;

namespace Meowv.Entity.Blog
{
    public class ArticleCategoryEntity : CommonEntity
    {
        public int ArticleId { get; set; }

        public int CategoryId { get; set; }
    }
}