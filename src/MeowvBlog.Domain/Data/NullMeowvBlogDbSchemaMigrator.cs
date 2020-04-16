using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace MeowvBlog.Data
{
    /* This is used if database provider does't define
     * IMeowvBlogDbSchemaMigrator implementation.
     */
    public class NullMeowvBlogDbSchemaMigrator : IMeowvBlogDbSchemaMigrator, ITransientDependency
    {
        public Task MigrateAsync()
        {
            return Task.CompletedTask;
        }
    }
}