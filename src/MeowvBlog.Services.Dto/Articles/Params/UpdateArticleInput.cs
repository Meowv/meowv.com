using System.ComponentModel.DataAnnotations;

namespace MeowvBlog.Services.Dto.Articles.Params
{
    /// <summary>
    /// 更新文章输入参数
    /// </summary>
    public class UpdateArticleInput : InsertArticleInput
    {
        /// <summary>
        /// 文章Id
        /// </summary>
        [Required]
        [Range(1, int.MaxValue)]
        public int ArticleId { get; set; }
    }
}