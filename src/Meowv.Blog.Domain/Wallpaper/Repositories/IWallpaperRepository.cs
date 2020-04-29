using System;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Domain.Wallpaper.Repositories
{
    /// <summary>
    /// IWallpaperRepository
    /// </summary>
    public interface IWallpaperRepository : IRepository<Wallpaper, Guid>
    {
    }
}