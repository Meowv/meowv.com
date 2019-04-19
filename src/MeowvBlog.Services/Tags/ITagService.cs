using MeowvBlog.Services.Dto.Common;
using MeowvBlog.Services.Dto.Tags.Params;
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
        /// 新增标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertAsync(InsertTagInput input);

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