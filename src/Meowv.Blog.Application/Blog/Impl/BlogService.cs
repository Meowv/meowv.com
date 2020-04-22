using Meowv.Blog.Application.Caching.Blog;
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog.Impl
{
    public partial class BlogService : MeowvBlogApplicationServiceBase, IBlogService
    {
        private readonly IBlogCacheService _blogCacheService;

        private readonly IPostRepository _postRepository;
        private readonly ICategoryRepository _categoryRepository;
        private readonly ITagRepository _tagRepository;
        private readonly IPostTagRepository _postTagRepository;
        private readonly IFriendLinkRepository _friendLinksRepository;

        public BlogService(IBlogCacheService blogCacheService,

                           IPostRepository postRepository,
                           ICategoryRepository categoryRepository,
                           ITagRepository tagRepository,
                           IPostTagRepository postTagRepository,
                           IFriendLinkRepository friendLinksRepository)
        {
            _blogCacheService = blogCacheService;

            _postRepository = postRepository;
            _categoryRepository = categoryRepository;
            _tagRepository = tagRepository;
            _postTagRepository = postTagRepository;
            _friendLinksRepository = friendLinksRepository;
        }

        /// <summary>
        /// 获取全部文章
        /// </summary>
        /// <returns></returns>
        public async Task<List<PostDto>> GetAllAsync()
        {
            return await _blogCacheService.GetAllAsync(async () =>
            {
                var list = await _postRepository.GetListAsync();

                var result = ObjectMapper.Map<List<Post>, List<PostDto>>(list);
                return result;
            });
        }
    }
}