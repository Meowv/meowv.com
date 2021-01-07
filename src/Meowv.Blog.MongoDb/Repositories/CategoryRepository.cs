using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories
{
    public class CategoryRepository : MongoDbRepositoryBase<Category>, ICategoryRepository
    {
        public CategoryRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}