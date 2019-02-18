using Meowv.Entity.Common;

namespace Meowv.Entity.Blog
{
    public class TagEntity : CommonEntity
    {
        public int TagId { get; set; }

        public string TagName { get; set; }
    }
}