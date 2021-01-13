using Meowv.Blog.Domain.News;
using Meowv.Blog.Domain.News.Repositories;
using Volo.Abp.MongoDB;

namespace Meowv.Blog.Repositories.News
{
    public class HotRepository : MongoDbRepositoryBase<Hot>, IHotRepository
    {
        public HotRepository(IMongoDbContextProvider<MeowvBlogMongoDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}