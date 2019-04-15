using MeowvBlog.Core.Domain.Articles;
using MeowvBlog.Core.Domain.Articles.Repositories;
using MeowvBlog.Services.Dto.Articles.Params;
using System.Threading.Tasks;
using UPrime;

namespace MeowvBlog.Services.Articles.Impl
{
    /// <summary>
    /// 文章服务接口实现
    /// </summary>
    public class ArticleService : ServiceBase, IArticleService
    {
        private readonly IArticleRepository _articleRepository;

        public ArticleService(IArticleRepository articleRepository)
        {
            _articleRepository = articleRepository;
        }

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput> InsertAsync(InsertArticleInput input)
        {
            var output = new ActionOutput<bool>();

            if (input.IsNull())
            {
                output.AddError("数据有误！");
            }

            using (var uow = UnitOfWorkManager.Begin())
            {
                var article = new Article
                {
                    Title = input.Title,
                    Author = input.Author,
                    Source = input.Source,
                    Url = input.Url,
                    Summary = input.Summary,
                    Content = input.Content,
                    MetaKeywords = input.MetaKeywords,
                    MetaDescription = input.MetaDescription
                };

                await _articleRepository.InsertAsync(article);

                await uow.CompleteAsync();
            }
            return output;
        }
    }
}