using Meowv.Blog.Domain.Blog.Repositories;
using System.Threading.Tasks;
using Volo.Abp.Application.Services;

namespace Meowv.Blog.Application.Blog.Impl
{
    public class BlogService : ApplicationService, IBlogService
    {
        private readonly IPostRepository _postRepository;

        public BlogService(IPostRepository postRepository)
        {
            _postRepository = postRepository;
        }

        /// <summary>
        /// 
        /// </summary>
        /// <returns></returns>
        public async Task<long> GetPostCountAsync()
        {
            return await _postRepository.GetCountAsync();
        }
    }
}