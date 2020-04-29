using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Wallpaper.Repositories
{
    /// <summary>
    /// IWallpaperRepository
    /// </summary>
    public interface IWallpaperRepository : IRepository<Wallpaper, Guid>
    {
        /// <summary>
        /// 批量插入
        /// </summary>
        /// <param name="wallpapers"></param>
        /// <returns></returns>
        Task BulkInsertAsync(IEnumerable<Wallpaper> wallpapers);
    }
}