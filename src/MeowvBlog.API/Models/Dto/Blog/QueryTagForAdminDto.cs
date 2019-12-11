using MeowvBlog.API.Models.Entity.Blog;

namespace MeowvBlog.Core.Dto.Blog
{
    public class QueryTagForAdminDto : Tag
    {
        /// <summary>
        /// 总数
        /// </summary>
        public int Count { get; set; }
    }
}