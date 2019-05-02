using MeowvBlog.Core.Domain;
using MeowvBlog.Core.Domain.Articles.Repositories;
using MeowvBlog.Core.Domain.Categories.Repositories;
using MeowvBlog.Core.Domain.Tags;
using MeowvBlog.Core.Domain.Tags.Repositories;
using MeowvBlog.Services.Dto.Articles;
using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Categories;
using MeowvBlog.Services.Dto.Common;
using MeowvBlog.Services.Dto.Tags;
using MeowvBlog.Services.Dto.Tags.Params;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UPrime;
using UPrime.AutoMapper;

namespace MeowvBlog.Services.Tags.Impl
{
    /// <summary>
    /// 标签服务接口实现
    /// </summary>
    public class TagService : ServiceBase, ITagService
    {
        private readonly IArticleRepository _articleRepository;
        private readonly IArticleCategoryRepository _articleCategoryRepository;
        private readonly IArticleTagRepository _articleTagRepository;
        private readonly ICategoryRepository _categoryRepository;
        private readonly ITagRepository _tagRepository;

        public TagService(
            IArticleRepository articleRepository,
            IArticleCategoryRepository articleCategoryRepository,
            IArticleTagRepository articleTagRepository,
            ICategoryRepository categoryRepository,
            ITagRepository tagRepository)
        {
            _articleRepository = articleRepository;
            _articleCategoryRepository = articleCategoryRepository;
            _articleTagRepository = articleTagRepository;
            _categoryRepository = categoryRepository;
            _tagRepository = tagRepository;
        }

        /// <summary>
        /// 所有标签列表
        /// </summary>
        /// <returns></returns>
        public async Task<ActionOutput<IList<GetTagsInput>>> GetAsync()
        {
            var output = new ActionOutput<IList<GetTagsInput>>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var list = new List<GetTagsInput>();

                var tags = await _tagRepository.GetAllListAsync();

                foreach (var item in tags.OrderBy(x => x.TagName))
                {
                    var count = await _articleTagRepository.CountAsync(x => x.TagId == item.Id);

                    list.Add(new GetTagsInput()
                    {
                        Tag = item.MapTo<TagDto>(),
                        Count = count,
                        Style = count.GetStyleByCount(tags.Count)
                    });
                }

                output.Result = list;

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 标签列表
        /// </summary>
        /// <param name="count"></param>
        /// <returns></returns>
        public async Task<ActionOutput<IList<TagDto>>> GetAsync(int count)
        {
            var output = new ActionOutput<IList<TagDto>>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var list = await _tagRepository.GetAllListAsync();
                list = list.Take(count).OrderBy(x => x.TagName).ToList();

                await uow.CompleteAsync();

                var result = list.MapTo<IList<TagDto>>();

                output.Result = result;
            }
            return output;
        }

        /// <summary>
        /// 通过标签名称查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        public async Task<ActionOutput<IList<GetArticleListOutput>>> QueryArticleListByAsync(string name)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<IList<GetArticleListOutput>>();

                var tag = await _tagRepository.FirstOrDefaultAsync(x => x.DisplayName == name);
                if (tag.IsNull())
                {
                    output.AddError(GlobalConsts.PARAMETER_ERROR);
                    return output;
                }

                var list = new List<GetArticleListOutput>();

                var articleIds = _articleTagRepository.GetAllListAsync(x => x.TagId == tag.Id)
                                                      .Result
                                                      .Select(x => x.ArticleId);

                var query = await _articleRepository.GetAllListAsync(x => articleIds.Contains(x.Id));

                var articles = query.OrderByDescending(x => x.PostTime)
                                    .ThenByDescending(x => x.Id)
                                    .ToList();

                foreach (var item in articles)
                {
                    var tagIds = _articleTagRepository.GetAllListAsync(x => x.ArticleId == item.Id)
                                                      .Result
                                                      .Select(x => x.TagId);
                    var tags = await _tagRepository.GetAllListAsync(x => tagIds.Contains(x.Id));

                    var categoryId = _articleCategoryRepository.FirstOrDefaultAsync(x => x.ArticleId == item.Id)
                                                               .Result.CategoryId;
                    var category = await _categoryRepository.FirstOrDefaultAsync(x => x.Id == categoryId);

                    list.Add(new GetArticleListOutput
                    {
                        Article = item.MapTo<ArticleBriefDto>(),
                        Category = category.MapTo<CategoryDto>(),
                        Tags = tags.Take(3).MapTo<IList<TagDto>>()
                    });
                }

                output.Result = list;

                await uow.CompleteAsync();

                return output;
            }
        }

        /// <summary>
        /// 新增标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertAsync(TagDto input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = new Tag
                {
                    TagName = input.TagName,
                    DisplayName = input.DisplayName,
                    CreationTime = DateTime.Now
                };
                await _tagRepository.InsertAsync(entity);

                output.Result = GlobalConsts.INSERT_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 更新标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> UpdateAsync(UpdateTagInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = await _tagRepository.GetAsync(input.TagId);
                entity.TagName = input.TagName;
                entity.DisplayName = input.DisplayName;
                await _tagRepository.UpdateAsync(entity);

                output.Result = GlobalConsts.UPDATE_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 删除标签
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeleteAsync(DeleteInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                await _tagRepository.DeleteAsync(input.Id);

                output.Result = GlobalConsts.DELETE_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }
    }
}