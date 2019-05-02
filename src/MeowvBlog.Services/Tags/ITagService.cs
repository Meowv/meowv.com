using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Common;
using MeowvBlog.Services.Dto.Tags;
using MeowvBlog.Services.Dto.Tags.Params;
using System.Collections.Generic;
using System.Threading.Tasks;
using UPrime;

namespace MeowvBlog.Services.Tags
{
    /// <summary>
    /// 标签服务接口
    /// </summary>
    public interface ITagService
    {
        /// <summary>
        /// 所有标签列表
        /// </summary>
        /// <returns></returns>
        Task<ActionOutput<IList<GetTagsInput>>> GetAsync();

        /// <summary>
        /// 标签列表
        /// </summary>
        /// <param name="count"></param>
        /// <returns></returns>
        Task<ActionOutput<IList<TagDto>>> GetAsync(int count);

        /// <summary>
        /// 通过标签名称查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        Task<ActionOutput<IList<GetArticleListOutput>>> QueryArticleListByAsync(string name);

        /// <summary>
        /// 新增标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertAsync(TagDto input);

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> UpdateAsync(UpdateTagInput input);

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> DeleteAsync(DeleteInput input);
    }
}