namespace MeowvBlog.Services.Dto
{
    public class PagingInput
    {
        /// <summary>
        /// 页码
        /// </summary>
        public int Page { get; set; } = 1;

        /// <summary>
        /// 限制条数
        /// </summary>
        public int Limit { get; set; } = 20;
    }
}