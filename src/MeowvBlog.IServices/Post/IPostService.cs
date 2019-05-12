using MeowvBlog.ActionOutput;
using MeowvBlog.Dtos.Post;
using System.Threading.Tasks;

namespace MeowvBlog.IServices.Post
{
    public interface IPostService
    {
        Task<ActionOutput<PostDto>> GetAsync(int id);
    }
}