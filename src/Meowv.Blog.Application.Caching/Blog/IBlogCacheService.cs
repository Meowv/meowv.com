using Meowv.Blog.Application.Contracts.Blog;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Caching.Blog
{
    public interface IBlogCacheService
    {
        Task<List<PostDto>> GetAllAsync(Func<Task<List<PostDto>>> func);
    }
}