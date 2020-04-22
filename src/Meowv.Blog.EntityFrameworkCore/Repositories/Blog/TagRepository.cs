using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using Volo.Abp.Domain.Repositories.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;

namespace Meowv.Blog.EntityFrameworkCore.Repositories.Blog
{
    /// <summary>
    /// TagRepository
    /// </summary>
    public class TagRepository : EfCoreRepository<MeowvBlogDbContext, Tag, int>, ITagRepository
    {
        public TagRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}