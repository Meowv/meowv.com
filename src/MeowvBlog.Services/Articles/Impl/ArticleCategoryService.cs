using MeowvBlog.Core.Domain.Articles.Repositories;

namespace MeowvBlog.Services.Articles.Impl
{
    /// <summary>
    /// 文章对应分类服务接口实现
    /// </summary>
    public class ArticleCategoryService : IArticleCategoryService
    {
        private readonly IArticleCategoryRepository _articleCategoryRepository;

        public ArticleCategoryService(IArticleCategoryRepository articleCategoryRepository)
        {
            _articleCategoryRepository = articleCategoryRepository;
        }
    }
}