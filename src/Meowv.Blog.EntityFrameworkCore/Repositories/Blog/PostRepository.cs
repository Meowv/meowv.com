using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using Volo.Abp.Domain.Repositories.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;

namespace Meowv.Blog.EntityFrameworkCore.Repositories.Blog
{
    /// <summary>
    /// PostRepository
    /// </summary>
    public class PostRepository : EfCoreRepository<MeowvBlogDbContext, Post, int>, IPostRepository
    {
        public PostRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}