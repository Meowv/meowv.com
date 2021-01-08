using Meowv.Blog.Domain.Blog.Repositories;
using System;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService : ServiceBase, IBlogService
    {
        private readonly IPostRepository _posts;

        public BlogService(IPostRepository posts)
        {
            _posts = posts;
        }

        public async Task<int> Get()
        {
            var count = await _posts.GetCountAsync();
            return Convert.ToInt32(count);
        }
    }
}