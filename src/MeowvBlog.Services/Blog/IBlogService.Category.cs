using MeowvBlog.Services.Dto.Blog;
using Plus;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog
{
    public partial interface IBlogService
    {
        /// <summary>
        /// 新增分类
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> InsertCategory(CategoryDto dto);

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> DeleteCategory(int id);

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> UpdateCategory(int id, CategoryDto dto);

        /// <summary>
        /// 获取分类名称
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        Task<ActionOutput<string>> GetCategory(string name);

        /// <summary>
        /// 查询分类列表
        /// </summary>
        /// <returns></returns>
        Task<IList<QueryCategoryDto>> QueryCategories();

        /// <summary>
        /// 查询分类列表 For Admin
        /// </summary>
        /// <returns></returns>
        Task<IList<QueryCategoryForAdminDto>> QueryCategoriesForAdmin();
    }
}