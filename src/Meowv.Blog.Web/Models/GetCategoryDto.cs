namespace Meowv.Blog.Dto.Blog
{
    public class GetCategoryDto : CategoryDto
    {
        /// <summary>
        /// 文章总数
        /// </summary>
        public int Total { get; set; }
    }
}