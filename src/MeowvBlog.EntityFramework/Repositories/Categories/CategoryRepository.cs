using MeowvBlog.Core.Domain.Categories;
using MeowvBlog.Core.Domain.Categories.Repositories;

namespace MeowvBlog.EntityFramework.Repositories.Categories
{
    /// <summary>
    /// 分类仓储接口实现
    /// </summary>
    public class CategoryRepository : MeowvBlogRepositoryBase<Category>, ICategoryRepository
    {
        public CategoryRepository(MeowvBlogDbContextProvider dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}