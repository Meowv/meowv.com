using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Caching.Blog.Impl
{
    public partial class BlogCacheService
    {
        public async Task<BlogResponse<PostDetailDto>> GetPostByUrlAsync(string url, Func<Task<BlogResponse<PostDetailDto>>> func) => await Cache.GetOrAddAsync(CachingConsts.CacheKeys.GetPostByUrl(url), func, CachingConsts.CacheStrategy.HALF_DAY);

        public async Task<BlogResponse<PagedList<GetPostDto>>> GetPostsAsync(int page, int limit, Func<Task<BlogResponse<PagedList<GetPostDto>>>> func) => await Cache.GetOrAddAsync(CachingConsts.CacheKeys.GetPosts(page, limit), func, CachingConsts.CacheStrategy.HALF_DAY);

        public async Task<BlogResponse<List<GetPostDto>>> GetPostsByCategoryAsync(string category, Func<Task<BlogResponse<List<GetPostDto>>>> func) => await Cache.GetOrAddAsync(CachingConsts.CacheKeys.GetPostsByCategory(category), func, CachingConsts.CacheStrategy.HALF_DAY);

        public async Task<BlogResponse<List<GetPostDto>>> GetPostsByTagAsync(string tag, Func<Task<BlogResponse<List<GetPostDto>>>> func) => await Cache.GetOrAddAsync(CachingConsts.CacheKeys.GetPostsByTag(tag), func, CachingConsts.CacheStrategy.HALF_DAY);
    }
}