using Meowv.Blog.Domain.Gallery;
using Meowv.Blog.Domain.Gallery.Repositories;
using System;
using Volo.Abp.Domain.Repositories.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;

namespace Meowv.Blog.EntityFrameworkCore.Repositories.Gallery
{
    public class AlbumRepository : EfCoreRepository<MeowvBlogDbContext, Album, Guid>, IAlbumRepository
    {
        public AlbumRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}