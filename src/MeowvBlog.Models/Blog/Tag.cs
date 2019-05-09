using System.Collections.Generic;

namespace MeowvBlog.Models.Blog
{
    public class Tag
    {
        /// <summary>
        /// 主键
        /// </summary>
        public int Id { get; set; }

        /// <summary>
        /// 标签名称
        /// </summary>
        public string TagName { get; set; }

        /// <summary>
        /// 展示名称
        /// </summary>
        public string DisplayName { get; set; }

        /// <summary>
        /// PostTags
        /// </summary>
        public virtual ICollection<PostTag> PostTags { get; set; }
    }
}