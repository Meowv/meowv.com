using Plus.Domain.Entities;

namespace MeowvBlog.Core.Domain.Blog
{
    public class Category : Entity
    {
        /// <summary>
        /// 分类名称
        /// </summary>
        public string CategoryName { get; set; }

        /// <summary>
        /// 展示名称
        /// </summary>
        public string DisplayName { get; set; }
    }
}