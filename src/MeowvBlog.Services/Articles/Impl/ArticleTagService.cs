using MeowvBlog.Core.Domain.Articles.Repositories;

namespace MeowvBlog.Services.Articles.Impl
{
    /// <summary>
    /// 文章对应标签服务接口实现
    /// </summary>
    public class ArticleTagService : IArticleTagService
    {
        private readonly IArticleTagRepository _articleTagRepository;

        public ArticleTagService(IArticleTagRepository articleTagRepository)
        {
            _articleTagRepository = articleTagRepository;
        }
    }
}