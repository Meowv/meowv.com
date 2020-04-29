using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.Wallpaper.Impl
{
    public class WallpaperCacheService : CachingServiceBase, IWallpaperCacheService
    {
        private const string KEY_GetWallpaperTypes = "Wallpaper:GetWallpaperTypes";

        /// <summary>
        /// 获取所有壁纸类型
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<EnumResponse>>> GetWallpaperTypesAsync(Func<Task<ServiceResult<IEnumerable<EnumResponse>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetWallpaperTypes, factory, CacheStrategy.NEVER);
        }
    }
}