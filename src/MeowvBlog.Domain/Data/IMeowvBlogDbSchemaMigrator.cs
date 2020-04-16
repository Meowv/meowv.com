using System.Threading.Tasks;

namespace MeowvBlog.Data
{
    public interface IMeowvBlogDbSchemaMigrator
    {
        Task MigrateAsync();
    }
}
