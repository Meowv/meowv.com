using Meowv.Blog.Domain.Blog.Repositories;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService : ServiceBase, IBlogService
    {
        private readonly IPostRepository _posts;

        public BlogService(IPostRepository posts)
        {
            _posts = posts;
        }
    }
}