using System.Collections.Generic;

namespace MeowvBlog.API.Models.Dto.Blog
{
    public class PostForAdminDto : PostDto
    {
        /// <summary>
        /// 标签列表
        /// </summary>
        public IList<string> Tags { get; set; }
    }
}