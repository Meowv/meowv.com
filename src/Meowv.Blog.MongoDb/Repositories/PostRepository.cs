using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories
{
    public class PostRepository : MongoDbRepositoryBase<Post>, IPostRepository
    {
        public PostRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}