using Meowv.Blog.Application.Contracts.Wallpaper;
using Meowv.Blog.Application.Contracts.Wallpaper.Params;
using Meowv.Blog.ToolKits.Base;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Caching.Wallpaper
{
    public interface IWallpaperCacheService
    {
        /// <summary>
        /// 获取所有壁纸类型
        /// </summary>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<EnumResponse>>> GetWallpaperTypesAsync(Func<Task<ServiceResult<IEnumerable<EnumResponse>>>> factory);

        /// <summary>
        /// 分页查询壁纸
        /// </summary>
        /// <param name="input"></param>
        /// <param name="factory"></param>
        /// <returns></returns>
        Task<ServiceResult<PagedList<WallpaperDto>>> QueryWallpapersAsync(QueryWallpapersInput input, Func<Task<ServiceResult<PagedList<WallpaperDto>>>> factory);
    }
}