using MeowvBlog.Core.Domain;
using MeowvBlog.Core.Domain.Repositories;
using Plus.EntityFramework;

namespace MeowvBlog.EntityFrameworkCore.Repositories
{
    public class PostRepository : MeowvBlogRepositoryBase<Post>, IPostRepository
    {
        public PostRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}