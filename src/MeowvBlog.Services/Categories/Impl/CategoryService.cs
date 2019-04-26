using MeowvBlog.Core.Domain;
using MeowvBlog.Core.Domain.Categories;
using MeowvBlog.Core.Domain.Categories.Repositories;
using MeowvBlog.Services.Dto.Categories;
using MeowvBlog.Services.Dto.Categories.Params;
using MeowvBlog.Services.Dto.Common;
using System;
using System.Collections.Generic;
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
        private readonly ICategoryRepository _categoryRepository;

        public CategoryService(ICategoryRepository categoryRepository)
        {
            _categoryRepository = categoryRepository;
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