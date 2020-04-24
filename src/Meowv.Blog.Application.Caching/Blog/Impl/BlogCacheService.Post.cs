using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using System;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.Blog.Impl
{
    public partial class BlogCacheService
    {
        private const string KEY_GetPostDetail = "Blog:Post:GetPostDetail-{0}";

        /// <summary>
        /// 根据URL获取文章详情
        /// </summary>
        /// <param name="url"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<PostDetailDto>> GetPostDetailAsync(string url, Func<Task<ServiceResult<PostDetailDto>>> factory)
        {
            return await _cache.GetOrAddAsync(KEY_GetPostDetail.FormatWith(url), factory, CacheStrategy.ONE_DAY);
        }
    }
}