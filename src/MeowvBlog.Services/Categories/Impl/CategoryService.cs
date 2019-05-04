using MeowvBlog.Core.Domain;
using MeowvBlog.Core.Domain.Articles.Repositories;
using MeowvBlog.Core.Domain.Categories;
using MeowvBlog.Core.Domain.Categories.Repositories;
using MeowvBlog.Core.Domain.Tags.Repositories;
using MeowvBlog.Services.Dto.Articles;
using MeowvBlog.Services.Dto.Articles.Params;
using MeowvBlog.Services.Dto.Categories;
using MeowvBlog.Services.Dto.Categories.Params;
using MeowvBlog.Services.Dto.Common;
using MeowvBlog.Services.Dto.Tags;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UPrime;
using UPrime.AutoMapper;

namespace MeowvBlog.Services.Categories.Impl
{
    /// <summary>
    /// 分类服务接口实现
    /// </summary>
    public class CategoryService : ServiceBase, ICategoryService
    {
        private readonly IArticleRepository _articleRepository;
        private readonly IArticleCategoryRepository _articleCategoryRepository;
        private readonly IArticleTagRepository _articleTagRepository;
        private readonly ICategoryRepository _categoryRepository;
        private readonly ITagRepository _tagRepository;

        public CategoryService(
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
        /// 分类列表
        /// </summary>
        /// <returns></returns>
        public async Task<ActionOutput<IList<CategoryDto>>> GetAsync()
        {
            var output = new ActionOutput<IList<CategoryDto>>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var list = await _categoryRepository.GetAllListAsync();

                await uow.CompleteAsync();

                var result = list.MapTo<IList<CategoryDto>>();

                output.Result = result;
            }
            return output;
        }

        /// <summary>
        /// 通过分类名称查询文章列表
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        public async Task<ActionOutput<IList<GetArticleListOutput>>> QueryArticleListByAsync(string name)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<IList<GetArticleListOutput>>();

                var category = await _categoryRepository.FirstOrDefaultAsync(x => x.DisplayName == name);
                if (category.IsNull())
                {
                    output.AddError(GlobalConsts.NONE_DATA);
                    return output;
                }

                var list = new List<GetArticleListOutput>();

                var articleIds = _articleCategoryRepository.GetAllListAsync(x => x.CategoryId == category.Id)
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
        /// Admin-查询所有分类
        /// </summary>
        /// <returns></returns>
        public async Task<ActionOutput<IList<Category>>> QueryAsync()
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<IList<Category>>
                {
                    Result = await _categoryRepository.GetAllListAsync()
                };

                await uow.CompleteAsync();

                return output;
            }
        }

        /// <summary>
        /// 新增分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertAsync(CategoryDto input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = new Category
                {
                    CategoryName = input.CategoryName,
                    DisplayName = input.DisplayName,
                    CreationTime = DateTime.Now
                };
                await _categoryRepository.InsertAsync(entity);

                output.Result = GlobalConsts.INSERT_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> UpdateAsync(UpdateCategoryInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = await _categoryRepository.GetAsync(input.CategoryId);
                entity.CategoryName = input.CategoryName;
                entity.DisplayName = input.DisplayName;
                await _categoryRepository.UpdateAsync(entity);

                output.Result = GlobalConsts.UPDATE_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeleteAsync(DeleteInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                await _categoryRepository.DeleteAsync(input.Id);

                output.Result = GlobalConsts.DELETE_SUCCESS;

                await uow.CompleteAsync();
            }
            return output;
        }
    }
}