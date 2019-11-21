namespace MeowvBlog.API.Models.Dto.Blog
{
    public class GetPostForAdminDto : PostDto
    {
        /// <summary>
        /// 标签
        /// </summary>
        public string Tags { get; set; }
    }
}