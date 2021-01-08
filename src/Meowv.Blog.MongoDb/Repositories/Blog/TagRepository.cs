using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories.Blog
{
    public class TagRepository : MongoDbRepositoryBase<Tag>, ITagRepository
    {
        public TagRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}