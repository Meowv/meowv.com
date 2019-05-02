using MeowvBlog.Services.Dto.Articles;
using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Common;
using System.Collections.Generic;
using System.Threading.Tasks;
using UPrime;
using UPrime.Services.Dto;

namespace MeowvBlog.Services.Articles
{
    /// <summary>
    /// 文章服务接口
    /// </summary>
    public partial interface IArticleService
    {
        /// <summary>
        /// 获取一篇文章详细信息
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        Task<ActionOutput<GetArticleOutput>> GetAsync(int id);

        /// <summary>
        /// 热门文章列表
        /// </summary>
        /// <returns></returns>
        Task<ActionOutput<IList<ArticleForHotDto>>> GetHotArticleAsync();

        /// <summary>
        /// 分页查询文章列表
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<PagedResultDto<GetArticleListOutput>> QueryAsync(PagingInput input);

        /// <summary>
        /// 通过关键词查询文章列表
        /// </summary>
        /// <param name="keywords"></param>
        /// <returns></returns>
        Task<ActionOutput<IList<GetArticleListOutput>>> QueryByAsync(string keywords);

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertAsync(InsertArticleInput input);

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> UpdateAsync(UpdateArticleInput input);

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> DeleteAsync(DeleteInput input);
    }
}