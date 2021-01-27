namespace Meowv.Blog.Dto.Blog
{
    public class GetTagDto : TagDto
    {
        /// <summary>
        /// 文章总数
        /// </summary>
        public int Total { get; set; }
    }
}