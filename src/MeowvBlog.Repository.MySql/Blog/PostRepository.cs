using MeowvBlog.IRepository.Blog;
using MeowvBlog.Models.Blog;

namespace MeowvBlog.Repository.MySql.Blog
{
    public class PostRepository : MeowvBlogRepositoryBase<Post>, IPostRepository
    {
        public PostRepository(IDbContextProvider<MeowvBlogDbContext> dbContextProvider) : base(dbContextProvider)
        {
        }
    }
}