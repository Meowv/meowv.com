using Meowv.Blog.ToolKits.Base;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Wallpaper
{
    public interface IWallpaperService
    {
        /// <summary>
        /// 获取所有壁纸类型
        /// </summary>
        /// <returns></returns>
        Task<ServiceResult<IEnumerable<EnumResponse>>> GetWallpaperTypesAsync();
    }
}