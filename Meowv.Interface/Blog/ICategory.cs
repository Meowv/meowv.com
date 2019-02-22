using Meowv.Entity.Blog;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Interface.Blog
{
    public interface ICategory
    {
        /// <summary>
        /// 添加分类
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        Task<bool> AddCategory(CategoryEntity entity);

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="categoryId"></param>
        /// <returns></returns>
        Task<bool> DeleteCategory(int categoryId);

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        Task<bool> UpdateCategory(CategoryEntity entity);

        /// <summary>
        /// 获取分类列表
        /// </summary>
        /// <returns></returns>
        Task<IEnumerable<CategoryEntity>> GetCategories();

        /// <summary>
        /// 根据文章ID获取分类
        /// </summary>
        /// <param name="articleId"></param>
        /// <returns></returns>
        Task<CategoryEntity> GetCategoryByArticleId(int articleId);
    }
}