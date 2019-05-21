using Plus.Domain.Repositories;

namespace MeowvBlog.Core.Domain.Repositories
{
    public interface IPostRepository : IRepository<Post, int>
    {
    }
}