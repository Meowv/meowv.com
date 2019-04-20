namespace MeowvBlog.Services.Dto.Articles.Params
{
    /// <summary>
    /// 新增文章对应的分类输入参数
    /// </summary>
    public class InsertArticleCategoryInput
    {
        /// <summary>
        /// 文章Id
        /// </summary>
        public int ArticleId { get; set; }

        /// <summary>
        /// 分类Id数组
        /// </summary>
        public int[] CategoryIds { get; set; }
    }
}