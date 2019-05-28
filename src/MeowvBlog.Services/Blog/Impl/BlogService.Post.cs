using MeowvBlog.Core.Domain.Blog.Repositories;
using MeowvBlog.Services.Dto.Blog;
using Plus.AutoMapper;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Blog.Impl
{
    public partial class BlogService : ServiceBase, IBlogService
    {
        private readonly IPostRepository _postRepository;

        public BlogService(IPostRepository postRepository)
        {
            _postRepository = postRepository;
        }

        public async Task<PostDto> Get(int id)
        {
            using (var uow = UnitOfWorkManager.Begin())
            {
                var entity = await _postRepository.GetAsync(id);

                await uow.CompleteAsync();

                return entity.MapTo<PostDto>();
            }
        }
    }
}