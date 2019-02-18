using Meowv.Entity.Common;

namespace Meowv.Entity.Blog
{
    public class ArticleTagEntity : CommonEntity
    {
        public int ArticleId { get; set; }

        public int TagId { get; set; }
    }
}