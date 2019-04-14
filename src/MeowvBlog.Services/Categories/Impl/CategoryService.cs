using MeowvBlog.Core.Domain.Categories.Repositories;

namespace MeowvBlog.Services.Categories.Impl
{
    /// <summary>
    /// 分类服务接口实现
    /// </summary>
    public class CategoryService : ICategoryService
    {
        private readonly ICategoryRepository _categoryRepository;

        public CategoryService(ICategoryRepository categoryRepository)
        {
            _categoryRepository = categoryRepository;
        }
    }
}