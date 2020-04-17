using Meowv.Blog.Domain.Blog;
using System.Threading.Tasks;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace Meowv.Blog.Application.Blog.Impl
{
    public class BlogService : ApplicationService, IBlogService
    {
        private readonly IRepository<Post, int> _blogRepository;

        public BlogService(IRepository<Post, int> blogRepository)
        {
            _blogRepository = blogRepository;
        }

        /// <summary>
        /// ...
        /// </summary>
        /// <returns></returns>
        public string Get()
        {
            return "qix";
        }

        /// <summary>
        /// 
        /// </summary>
        /// <returns></returns>
        public async Task<long> PostCountAsync()
        {
            return await _blogRepository.GetCountAsync();
        }
    }
}