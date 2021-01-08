using Meowv.Blog.Domain.Blog.Repositories;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService : ServiceBase, IBlogService
    {
        private readonly IPostRepository _posts;
        private readonly ICategoryRepository _categories;
        private readonly ITagRepository _tags;
        private readonly IFriendLinkRepository _friendLinks;

        public BlogService(IPostRepository posts,
                           ICategoryRepository categories,
                           ITagRepository tags,
                           IFriendLinkRepository friendLinks)
        {
            _posts = posts;
            _categories = categories;
            _tags = tags;
            _friendLinks = friendLinks;
        }
    }
}