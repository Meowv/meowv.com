using Meowv.Blog.Application.Caching.Blog;
using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using System.Collections.Generic;
using System.Threading.Tasks;
using Volo.Abp.Application.Services;

namespace Meowv.Blog.Application.Blog.Impl
{
    public class BlogService : ApplicationService, IBlogService
    {
        private readonly IBlogCacheService _blogCacheService;
        private readonly IPostRepository _postRepository;

        public BlogService(IBlogCacheService blogCacheService, IPostRepository postRepository)
        {
            _blogCacheService = blogCacheService;
            _postRepository = postRepository;
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