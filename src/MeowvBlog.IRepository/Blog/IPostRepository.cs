using MeowvBlog.Models.Blog;

namespace MeowvBlog.IRepository.Blog
{
    public interface IPostRepository : IRepository<Post, int>
    {
    }
}