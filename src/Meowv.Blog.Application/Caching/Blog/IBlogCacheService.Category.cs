using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Caching.Blog
{
    public partial interface IBlogCacheService
    {
        /// <summary>
        /// Get the list of categories from the cache.
        /// </summary>
        /// <param name="func"></param>
        /// <returns></returns>
        Task<BlogResponse<List<GetCategoryDto>>> GetCategoriesAsync(Func<Task<BlogResponse<List<GetCategoryDto>>>> func);
    }
}