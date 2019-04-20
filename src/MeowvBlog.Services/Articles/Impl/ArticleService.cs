using MeowvBlog.Core.Configuration;
using MeowvBlog.Core.Domain;
using MeowvBlog.Core.Domain.Articles;
using MeowvBlog.Core.Domain.Articles.Repositories;
using MeowvBlog.Services.Dto.Articles;
using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Common;
using System;
using System.Threading.Tasks;
using UPrime;
using UPrime.AutoMapper;

namespace MeowvBlog.Services.Articles.Impl
{
    /// <summary>
    /// 文章服务接口实现
    /// </summary>
    public partial class ArticleService : ServiceBase, IArticleService
    {
        private readonly IArticleRepository _articleRepository;
        private readonly IArticleCategoryRepository _articleCategoryRepository;
        private readonly IArticleTagRepository _articleTagRepository;

        public ArticleService(IArticleRepository articleRepository, IArticleCategoryRepository articleCategoryRepository, IArticleTagRepository articleTagRepository)
        {
            _articleRepository = articleRepository;
            _articleCategoryRepository = articleCategoryRepository;
            _articleTagRepository = articleTagRepository;
        }

        /// <summary>
        /// 当前数据库是否为SqlServer
        /// </summary>
        public static bool IsSqlServer => AppSettings.DbType == GlobalConsts.DBTYPE_SQLSERVER;

        /// <summary>
        /// 获取一篇文章详细信息
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public async Task<ActionOutput<ArticleDto>> GetAsync(int id)
        {
            var output = new ActionOutput<ArticleDto>();

            if (id <= 0)
            {
                output.AddError(GlobalConsts.PARAMETER_ERROR);
                return output;
            }

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = await _articleRepository.FirstOrDefaultAsync(x => x.Id == id && x.IsDeleted == false);
                if (entity.IsNull())
                {
                    output.AddError(GlobalConsts.NONE_DATA);
                    return output;
                }

                output.Result = entity.MapTo<ArticleDto>();

                await uow.CompleteAsync();
            }

            return output;
        }

        /// <summary>
        /// 新增文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertAsync(InsertArticleInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = new Article
                {
                    Title = input.Title,
                    Author = input.Author,
                    Source = input.Source,
                    Url = input.Url,
                    Summary = input.Summary,
                    Content = input.Content,
                    Hits = 0,
                    MetaKeywords = input.MetaKeywords,
                    MetaDescription = input.MetaDescription,
                    CreationTime = DateTime.Now,
                    PostTime = input.PostTime,
                    IsDeleted = false
                };
                await _articleRepository.InsertAsync(entity);

                output.Result = GlobalConsts.INSERT_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 更新文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> UpdateAsync(UpdateArticleInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = await _articleRepository.GetAsync(input.ArticleId);
                entity.Title = input.Title;
                entity.Author = input.Author;
                entity.Source = input.Source;
                entity.Url = input.Url;
                entity.Summary = input.Summary;
                entity.Content = input.Content;
                entity.MetaKeywords = input.MetaKeywords;
                entity.MetaDescription = input.MetaDescription;
                entity.PostTime = input.PostTime;
                await _articleRepository.UpdateAsync(entity);

                output.Result = GlobalConsts.UPDATE_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 删除文章
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeleteAsync(DeleteInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = await _articleRepository.GetAsync(input.Id);
                entity.IsDeleted = true;
                await _articleRepository.UpdateAsync(entity);

                output.Result = GlobalConsts.DELETE_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }
    }
}