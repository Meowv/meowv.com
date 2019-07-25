using Plus.Domain.Entities;

namespace MeowvBlog.Core.Domain.Blog
{
    public class Tag : Entity
    {
        /// <summary>
        /// 标签名称
        /// </summary>
        public string TagName { get; set; }

        /// <summary>
        /// 展示名称
        /// </summary>
        public string DisplayName { get; set; }
    }
}