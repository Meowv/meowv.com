using Plus.Domain.Repositories;

namespace MeowvBlog.Core.Domain.Blog.Repositories
{
    public interface IPostRepository : IRepository<Post, int>
    {
    }
}