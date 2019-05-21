using MeowvBlog.Core.Domain.Repositories;
using MeowvBlog.Services.Dto.Blog;
using Plus.AutoMapper;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog.Impl
{
    public partial class BlogService : IBlogService
    {
        private readonly IPostRepository _postRepository;

        public BlogService(IPostRepository postRepository)
        {
            _postRepository = postRepository;
        }

        public async Task<PostDto> Get(int id)
        {
            var entity = await _postRepository.GetAsync(id);
            return entity.MapTo<PostDto>();
        }
    }
}