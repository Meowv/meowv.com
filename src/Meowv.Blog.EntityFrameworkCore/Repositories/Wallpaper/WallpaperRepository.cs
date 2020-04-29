using Meowv.Blog.Domain.Wallpaper.Repositories;
using System;
using Volo.Abp.Domain.Repositories.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;

namespace Meowv.Blog.EntityFrameworkCore.Repositories.Wallpaper
{
    public class WallpaperRepository : EfCoreRepository<MeowvBlogDbContext, Domain.Wallpaper.Wallpaper, Guid>, IWallpaperRepository
    {
        public WallpaperRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}