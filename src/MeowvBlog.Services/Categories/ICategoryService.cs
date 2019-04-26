using MeowvBlog.Services.Dto.Categories;
using MeowvBlog.Services.Dto.Categories.Params;
using MeowvBlog.Services.Dto.Common;
using System.Collections.Generic;
using System.Threading.Tasks;
using UPrime;

namespace MeowvBlog.Services.Categories
{
    /// <summary>
    /// 分类服务接口
    /// </summary>
    public interface ICategoryService
    {
        /// <summary>
        /// 分类列表
        /// </summary>
        /// <returns></returns>
        Task<ActionOutput<IList<CategoryDto>>> GetAsync();

        /// <summary>
        /// 新增分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertAsync(CategoryDto input);

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> UpdateAsync(UpdateCategoryInput input);

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> DeleteAsync(DeleteInput input);
    }
}