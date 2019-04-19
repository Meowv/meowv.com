namespace MeowvBlog.Services.Dto.Articles.Params
{
    /// <summary>
    /// 新增文章对应的标签输入参数
    /// </summary>
    public class InsertArticleTagInput
    {
        /// <summary>
        /// 文章Id
        /// </summary>
        public int ArticleId { get; set; }

        /// <summary>
        /// 标签Id数组
        /// </summary>
        public int[] TagIds { get; set; }
    }
}