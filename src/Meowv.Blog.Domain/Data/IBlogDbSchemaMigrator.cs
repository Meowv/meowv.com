using System.Threading.Tasks;

namespace Meowv.Blog.Data
{
    public interface IBlogDbSchemaMigrator
    {
        Task MigrateAsync();
    }
}
