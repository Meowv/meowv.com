namespace MeowvBlog.API.Models.Dto
{
    /// <summary>
    /// 分页输入参数
    /// </summary>
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