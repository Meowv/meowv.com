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
    }
}