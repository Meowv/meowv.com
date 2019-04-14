using MeowvBlog.Core.Domain.Articles.Repositories;

namespace MeowvBlog.Services.Articles.Impl
{
    /// <summary>
    /// 文章服务接口实现
    /// </summary>
    public class ArticleService : IArticleService
    {
        private readonly IArticleRepository _articleRepository;

        public ArticleService(IArticleRepository articleRepository)
        {
            _articleRepository = articleRepository;
        }
    }
}