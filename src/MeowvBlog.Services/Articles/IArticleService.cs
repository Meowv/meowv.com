using MeowvBlog.Services.Dto.Articles.Params;
using System.Threading.Tasks;
using UPrime;

namespace MeowvBlog.Services.Articles
{
    /// <summary>
    /// 文章服务接口
    /// </summary>
    public interface IArticleService
    {
        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput> InsertAsync(InsertArticleInput input);
    }
}