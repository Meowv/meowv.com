using Plus.Domain.Repositories;

namespace MeowvBlog.Core.Domain.Blog.Repositories
{
    public interface ICategoryRepository : IRepository<Category, int>
    {
    }
}