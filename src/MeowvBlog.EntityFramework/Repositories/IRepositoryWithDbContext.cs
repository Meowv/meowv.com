using Microsoft.EntityFrameworkCore;

namespace MeowvBlog.EntityFramework.Repositories
{
    public interface IRepositoryWithDbContext
    {
        DbContext GetDbContext();
    }
}