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
        /// 新增文章对应的标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertArticleTagAsync(InsertArticleTagInput input)
        {
            var output = new ActionOutput<string>();

            if (input.TagIds.Length < 0 || input.ArticleId < 0)
            {
                output.AddError(GlobalConsts.PARAMETER_ERROR);
            }

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entities = new List<ArticleTag>();
                for (int i = 0; i < input.TagIds.Length; i++)
                {
                    var entity = new ArticleTag
                    {
                        ArticleId = input.ArticleId,
                        TagId = input.TagIds[i]
                    };
                    entities.Add(entity);
                }

                //var result = await _articleTagRepository.BulkInsertAsync(entities);
                var result = await _articleTagRepository.BulkInsertByDapperAsync(entities);
                output.Result = result ? GlobalConsts.INSERT_SUCCESS : GlobalConsts.INSERT_FAILURE;

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 删除文章对应的标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeleteArticleTagAsync(DeleteInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                await _articleTagRepository.DeleteAsync(input.Id);

                output.Result = GlobalConsts.DELETE_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }
    }
}