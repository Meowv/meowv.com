using MeowvBlog.Core.Domain;
using MeowvBlog.Core.Domain.Articles;
using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Common;
using System.Collections.Generic;
using System.Threading.Tasks;
using UPrime;

namespace MeowvBlog.Services.Articles.Impl
{
    public partial class ArticleService
    {
        /// <summary>
        /// 新增文章对应的分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertArticleCategoryAsync(InsertArticleCategoryInput input)
        {
            var output = new ActionOutput<string>();

            if (input.CategoryIds.Length < 0 || input.ArticleId < 0)
            {
                output.AddError(GlobalConsts.PARAMETER_ERROR);
            }

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entities = new List<ArticleCategory>();
                for (int i = 0; i < input.CategoryIds.Length; i++)
                {
                    var entity = new ArticleCategory
                    {
                        ArticleId = input.ArticleId,
                        CategoryId = input.CategoryIds[i]
                    };
                    entities.Add(entity);
                }

                bool result;

                if (IsSqlServer)
                    result = await _articleCategoryRepository.BulkInsertForSqlServerAsync(entities);
                else
                    result = await _articleCategoryRepository.BulkInsertAsync(entities);
                
                output.Result = result ? GlobalConsts.INSERT_SUCCESS : GlobalConsts.INSERT_FAILURE;

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 删除文章对应的分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeleteArticleCategoryAsync(DeleteInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                await _articleCategoryRepository.DeleteAsync(input.Id);

                output.Result = GlobalConsts.DELETE_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }
    }
}