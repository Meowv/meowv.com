using Meowv.Blog.Application.Contracts.Wallpaper;
using Meowv.Blog.Application.Contracts.Wallpaper.Params;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using static Meowv.Blog.Domain.Shared.MeowvBlogConsts;

namespace Meowv.Blog.Application.Caching.Wallpaper.Impl
{
    public class WallpaperCacheService : CachingServiceBase, IWallpaperCacheService
    {
        private const string KEY_GetWallpaperTypes = "Wallpaper:GetWallpaperTypes";
        private const string KEY_QueryWallpapers = "Wallpaper:QueryWallpapers-{0}-{1}-{2}-{3}";

        /// <summary>
        /// 获取所有壁纸类型
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<EnumResponse>>> GetWallpaperTypesAsync(Func<Task<ServiceResult<IEnumerable<EnumResponse>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_GetWallpaperTypes, factory, CacheStrategy.NEVER);
        }

        /// <summary>
        /// 分页查询壁纸
        /// </summary>
        /// <param name="input"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        public async Task<ServiceResult<PagedList<WallpaperDto>>> QueryWallpapersAsync(QueryWallpapersInput input, Func<Task<ServiceResult<PagedList<WallpaperDto>>>> factory)
        {
            return await Cache.GetOrAddAsync(KEY_QueryWallpapers.FormatWith(input.Page, input.Limit, input.Type, input.Keywords), factory, CacheStrategy.HALF_HOURS);
        }
    }
}