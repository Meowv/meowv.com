using System.Threading.Tasks;
using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;

namespace Meowv.Blog.TestBase
{
    public class MeowvBlogTestDataSeedContributor : IDataSeedContributor, ITransientDependency
    {
        public Task SeedAsync(DataSeedContext context)
        {
            // Seed additional test data...

            return Task.CompletedTask;
        }
    }
}