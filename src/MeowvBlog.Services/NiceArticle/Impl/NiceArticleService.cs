using MeowvBlog.Core.Domain.Blog.Repositories;
using MeowvBlog.Core.Domain.NiceArticle.Repositories;
using MeowvBlog.Services.Dto;
using MeowvBlog.Services.Dto.NiceArticle;
using Plus;
using Plus.Services.Dto;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.Services.NiceArticle.Impl
{
    public class NiceArticleService : ServiceBase, INiceArticleService
    {
        private readonly INiceArticleRepository _niceArticleRepository;
        private readonly ICategoryRepository _categoryRepository;

        public NiceArticleService(INiceArticleRepository niceArticleRepository, ICategoryRepository categoryRepository)
        {
            _niceArticleRepository = niceArticleRepository;
            _categoryRepository = categoryRepository;
        }

        /// <summary>
        /// 批量新增好文
        /// </summary>
        /// <param name="dtos"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> BulkInsertNiceArticle(IList<NiceArticleDto> dtos)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                var niceArticle = dtos.Select(x => new Core.Domain.NiceArticle.NiceArticle
                {
                    Title = x.Title,
                    Author = x.Author,
                    Source = x.Source,
                    Url = x.Url,
                    CategoryId = x.CategoryId,
                    Time = x.Time
                }).ToList();

                var result = await _niceArticleRepository.BulkInsertNiceArticleAsync(niceArticle);

                await uow.CompleteAsync();

                if (result)
                    output.Result = "success";
                else
                    output.AddError("新增标签出错了~~~");

                return output;
            }
        }

        /// <summary>
        /// 新增好文
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertNiceArticle(NiceArticleDto dto)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                var niceArticle = new Core.Domain.NiceArticle.NiceArticle
                {
                    Title = dto.Title,
                    Author = dto.Author,
                    Source = dto.Source,
                    Url = dto.Url,
                    CategoryId = dto.CategoryId,
                    Time = dto.Time
                };

                var result = await _niceArticleRepository.InsertAsync(niceArticle);
                await uow.CompleteAsync();

                if (result.IsNull())
                    output.AddError("新增标签出错了~~~");
                else
                    output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 分页查询好文
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<PagedResultDto<QueryNiceArticleDto>> QueryNicceArticle(PagingInput input)
        {
            var count = await _niceArticleRepository.CountAsync();

            var result = (from niceArticles in await _niceArticleRepository.GetAllListAsync()
                          join categories in await _categoryRepository.GetAllListAsync()
                          on niceArticles.CategoryId equals categories.Id
                          orderby niceArticles.Time descending
                          select new QueryNiceArticleDto
                          {
                              Title = niceArticles.Title,
                              Author = niceArticles.Author,
                              Source = niceArticles.Source,
                              Url = niceArticles.Url,
                              Category = categories.CategoryName,
                              Time = niceArticles.Time.ToString("MMMM dd, yyyy HH:mm:ss", new CultureInfo("en-us")),
                          }).PageByIndex(input.Page, input.Limit).ToList();

            return new PagedResultDto<QueryNiceArticleDto>(count, result);
        }
    }
}