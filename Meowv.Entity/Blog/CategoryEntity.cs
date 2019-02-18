using Meowv.Entity.Common;

namespace Meowv.Entity.Blog
{
    public class CategoryEntity : CommonEntity
    {
        public int CategoryId { get; set; }

        public string CategoryName { get; set; }
    }
}