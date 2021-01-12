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
        /// Get the list of tags from the cache.
        /// </summary>
        /// <param name="func"></param>
        /// <returns></returns>
        Task<BlogResponse<List<GetTagDto>>> GetTagsAsync(Func<Task<BlogResponse<List<GetTagDto>>>> func);
    }
}