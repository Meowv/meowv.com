using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// Create a category.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/blog/category")]
        public async Task<BlogResponse> CreateCategoryAsync(CreateCategoryInput input)
        {
            var response = new BlogResponse();

            var category = await _categories.FindAsync(x => x.Name == input.Name);
            if (category is not null)
            {
                response.IsFailed($"The category:{input.Name} already exists.");
                return response;
            }

            await _categories.InsertAsync(new Category
            {
                Name = input.Name,
                Alias = input.Alias
            });

            return response;
        }

        /// <summary>
        /// Delete category by id.
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/blog/category/{id}")]
        public async Task<BlogResponse> DeleteCategoryAsync(string id)
        {
            var response = new BlogResponse();

            var category = await _categories.FindAsync(id.ToObjectId());
            if (category is null)
            {
                response.IsFailed($"The category id not exists.");
                return response;
            }

            await _categories.DeleteAsync(id.ToObjectId());

            return response;
        }

        /// <summary>
        /// Update category by id.
        /// </summary>
        /// <param name="id"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/blog/category/{id}")]
        public async Task<BlogResponse> UpdateCategoryAsync(string id, UpdateCategoryInput input)
        {
            var response = new BlogResponse();

            var category = await _categories.FindAsync(id.ToObjectId());
            if (category is null)
            {
                response.IsFailed($"The category id not exists.");
                return response;
            }

            category.Name = input.Name;
            category.Alias = input.Alias;

            await _categories.UpdateAsync(category);

            return response;
        }

        /// <summary>
        /// Get the list of categories.
        /// </summary>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/blog/admin/categories")]
        public async Task<BlogResponse<List<GetAdminCategoryDto>>> GetAdminCategoriesAsync()
        {
            var response = new BlogResponse<List<GetAdminCategoryDto>>();

            var categories = await _categories.GetListAsync();

            var result = ObjectMapper.Map<List<Category>, List<GetAdminCategoryDto>>(categories);
            result.ForEach(x =>
            {
                x.Total = _posts.GetCountByCategoryAsync(x.Id.ToObjectId()).Result;
            });

            response.Result = result;
            return response;
        }
    }
}