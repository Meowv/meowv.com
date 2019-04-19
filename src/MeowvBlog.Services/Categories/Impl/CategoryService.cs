using MeowvBlog.Core.Domain;
using MeowvBlog.Core.Domain.Categories;
using MeowvBlog.Core.Domain.Categories.Repositories;
using MeowvBlog.Services.Dto.Categories.Params;
using MeowvBlog.Services.Dto.Common;
using System;
using System.Threading.Tasks;
using UPrime;

namespace MeowvBlog.Services.Categories.Impl
{
    /// <summary>
    /// 分类服务接口实现
    /// </summary>
    public class CategoryService : ServiceBase, ICategoryService
    {
        private readonly ICategoryRepository _categoryRepository;

        public CategoryService(ICategoryRepository categoryRepository)
        {
            _categoryRepository = categoryRepository;
        }

        /// <summary>
        /// 新增分类
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertAsync(InsertCategoryInput input)
        {
            var output = new ActionOutput<string>();

            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = new Category
                {
                    CategoryName = input.CategoryName,
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