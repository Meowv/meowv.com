using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Caching.Blog
{
    public partial interface IBlogCacheService
    {
        /// <summary>
        /// 根据URL获取文章详情
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        Task<ServiceResult<PostDetailDto>> GetPostDetailAsync(string url, Func<Task<ServiceResult<PostDetailDto>>> factory);
    }
}