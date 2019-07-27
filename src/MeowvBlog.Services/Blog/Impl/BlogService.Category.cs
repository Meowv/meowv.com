using MeowvBlog.Core.Domain.Blog;
using MeowvBlog.Services.Dto.Blog;
using Plus;
using Plus.AutoMapper;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// 新增分类
        /// </summary>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> InsertCategory(CategoryDto dto)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();
                var category = new Category
                {
                    CategoryName = dto.CategoryName,
                    DisplayName = dto.DisplayName
                };

                var result = await _categoryRepository.InsertAsync(category);
                await uow.CompleteAsync();

                if (result.IsNull())
                    output.AddError("新增分类出错了~~~");
                else
                    output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 删除分类
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> DeleteCategory(int id)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                await _categoryRepository.DeleteAsync(id);
                await uow.CompleteAsync();

                output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 更新分类
        /// </summary>
        /// <param name="id"></param>
        /// <param name="dto"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> UpdateCategory(int id, CategoryDto dto)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var output = new ActionOutput<string>();

                var category = new Category
                {
                    Id = id,
                    CategoryName = dto.CategoryName,
                    DisplayName = dto.DisplayName
                };

                var result = await _categoryRepository.UpdateAsync(category);
                await uow.CompleteAsync();

                if (result.IsNull())
                    output.AddError("更新分类出错了~~~");
                else
                    output.Result = "success";

                return output;
            }
        }

        /// <summary>
        /// 获取分类名称
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        public async Task<ActionOutput<string>> GetCategory(string name)
        {
            var output = new ActionOutput<string>();

            var category = await _categoryRepository.FirstOrDefaultAsync(x => x.DisplayName == name);
            if (category.IsNull())
            {
                output.AddError("找了找不到了~~~");
                return output;
            }

            output.Result = category.CategoryName;

            return output;
        }

        /// <summary>
        /// 查询分类列表
        /// </summary>
        /// <returns></returns>
        public async Task<IList<QueryCategoryDto>> QueryCategories()
        {
            return (from category in await _categoryRepository.GetAllListAsync()
                    join posts in await _postRepository.GetAllListAsync()
                    on category.Id equals posts.CategoryId
                    group category by new
                    {
                        category.CategoryName,
                        category.DisplayName
                    } into g
                    select new QueryCategoryDto
                    {
                        CategoryName = g.Key.CategoryName,
                        DisplayName = g.Key.DisplayName,
                        Count = g.Count()
                    }).ToList();
        }

        /// <summary>
        /// 查询分类列表 For Admin
        /// </summary>
        /// <returns></returns>
        public async Task<IList<QueryCategoryForAdminDto>> QueryCategoriesForAdmin()
        {
            var categories = await _categoryRepository.GetAllListAsync();
            var posts = await _postRepository.GetAllListAsync();

            var result = new List<QueryCategoryForAdminDto>();

            categories.ForEach(x =>
            {
                result.Add(new QueryCategoryForAdminDto
                {
                    Id = x.Id,
                    CategoryName = x.CategoryName,
                    DisplayName = x.DisplayName,
                    Count = posts.Count(p => p.CategoryId == x.Id)
                });
            });

            return result;
        }
    }
}