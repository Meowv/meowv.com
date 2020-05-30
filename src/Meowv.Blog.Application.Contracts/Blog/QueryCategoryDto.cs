namespace Meowv.Blog.Application.Contracts.Blog
{
    public class QueryCategoryDto : CategoryDto
    {
        /// <summary>
        /// 总数
        /// </summary>
        public int Count { get; set; }
    }
}