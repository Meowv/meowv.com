using Meowv.Blog.ToolKits.Base;
using System;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.Common.Impl
{
    public class CommonCacheService : CachingServiceBase, ICommonCacheService
    {
        private const string KEY_GetBingImgUrl = "Common:Bing:ImgUrl";
        private const string KEY_GetBingImgFile = "Common:Bing:ImgFile";

        /// <summary>
        /// 获取必应每日壁纸，返回图片URL
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<string>> GetBingImgUrlAsync(Func<Task<ServiceResult<string>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetBingImgUrl, factory, CacheStrategy.HALF_DAY);
        }

        /// <summary>
        /// 获取必应每日壁纸，直接返回图片
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<byte[]>> GetBingImgFileAsync(Func<Task<ServiceResult<byte[]>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetBingImgFile, factory, CacheStrategy.HALF_DAY);
        }
    }
}