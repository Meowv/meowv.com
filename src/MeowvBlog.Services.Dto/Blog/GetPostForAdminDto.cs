namespace MeowvBlog.Services.Dto.Blog
{
    public class GetPostForAdminDto : PostDto
    {
        /// <summary>
        /// 创建时间
        /// </summary>
        public new string CreationTime { get; set; }

        /// <summary>
        /// 标签
        /// </summary>
        public string Tags { get; set; }
    }
}