using MeowvBlog.ActionOutput;
using MeowvBlog.AutoMapper;
using MeowvBlog.Dtos.Post;
using MeowvBlog.IRepository.Blog;
using MeowvBlog.IServices.Post;
using System.Threading.Tasks;

namespace MeowvBlog.Services.Post
{
    public class PostService : IPostService
    {
        private readonly IPostRepository _postRepository;

        public PostService(IPostRepository postRepository)
        {
            _postRepository = postRepository;
        }

        public async Task<ActionOutput<PostDto>> GetAsync(int id)
        {
            var output = new ActionOutput<PostDto>();

            var post = await _postRepository.GetAsync(id);

            output.Result = post.MapTo<PostDto>();

            return output;
        }
    }
}