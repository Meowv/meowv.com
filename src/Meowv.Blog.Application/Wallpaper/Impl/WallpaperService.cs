using Meowv.Blog.Application.Caching.Wallpaper;
using Meowv.Blog.Domain.Shared.Enum;
using Meowv.Blog.ToolKits.Base;
using Meowv.Blog.ToolKits.Extensions;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Wallpaper.Impl
{
    public class WallpaperService : ServiceBase, IWallpaperService
    {
        private readonly IWallpaperCacheService _wallpaperCacheService;

        public WallpaperService(IWallpaperCacheService wallpaperCacheService)
        {
            _wallpaperCacheService = wallpaperCacheService;
        }

        /// <summary>
        /// 获取所有壁纸类型
        /// </summary>
        /// <returns></returns>
        public async Task<ServiceResult<IEnumerable<EnumResponse>>> GetWallpaperTypesAsync()
        {
            return await _wallpaperCacheService.GetWallpaperTypesAsync(async () =>
            {
                var result = new ServiceResult<IEnumerable<EnumResponse>>();

                var types = typeof(WallpaperEnum).TryToList();
                result.IsSuccess(types);

                return await Task.FromResult(result);
            });
        }
    }
}