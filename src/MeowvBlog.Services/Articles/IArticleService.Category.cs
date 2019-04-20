using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Common;
using System.Threading.Tasks;
using UPrime;

namespace MeowvBlog.Services.Articles
{
    /// <summary>
    /// 文章对应的分类服务接口
    /// </summary>
    public partial interface IArticleService
    {
        /// <summary>
        /// 新增文章对应的分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertArticleCategoryAsync(InsertArticleCategoryInput input);

        /// <summary>
        /// 删除文章对应的分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> DeleteArticleCategoryAsync(DeleteInput input);
    }
}