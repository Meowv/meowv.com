using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Common;
using System.Threading.Tasks;
using UPrime;

namespace MeowvBlog.Services.Articles
{
    /// <summary>
    /// 文章对应的标签服务接口
    /// </summary>
    public partial interface IArticleService
    {
        /// <summary>
        /// 新增文章对应的标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertArticleTagAsync(InsertArticleTagInput input);

        /// <summary>
        /// 删除文章对应的标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> DeleteArticleTagAsync(DeleteInput input);
    }
}