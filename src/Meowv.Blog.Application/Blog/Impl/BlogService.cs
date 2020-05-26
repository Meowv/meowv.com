using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Domain.Blog.Repositories;
using Meowv.Blog.ToolKits.Base;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog.Impl
{
    public class BlogService : ServiceBase, IBlogService
    {
        private readonly IPostRepository _postRepository;

        public BlogService(IPostRepository postRepository)
        {
            _postRepository = postRepository;
        }

        public async Task<ServiceResult<string>> InsertPostAsync(PostDto dto)
        {
            var result = new ServiceResult<string>();

            var entity = ObjectMapper.Map<PostDto, Post>(dto);

            var post = await _postRepository.InsertAsync(entity);
            if (post == null)
            {
                result.IsFailed("添加失败");
                return result;
            }

            result.IsSuccess("添加成功");
            return result;
        }

        public async Task<ServiceResult> DeletePostAsync(int id)
        {
            var result = new ServiceResult();

            await _postRepository.DeleteAsync(id);

            return result;
        }

        public async Task<ServiceResult<string>> UpdatePostAsync(int id, PostDto dto)
        {
            var result = new ServiceResult<string>();

            var post = await _postRepository.GetAsync(id);
            if (post == null)
            {
                result.IsFailed("文章不存在");
                return result;
            }

            post.Title = dto.Title;
            post.Author = dto.Author;
            post.Url = dto.Url;
            post.Html = dto.Html;
            post.Markdown = dto.Markdown;
            post.CategoryId = dto.CategoryId;
            post.CreationTime = dto.CreationTime;

            await _postRepository.UpdateAsync(post);

            result.IsSuccess("更新成功");
            return result;
        }

        public async Task<ServiceResult<PostDto>> GetPostAsync(int id)
        {
            var result = new ServiceResult<PostDto>();

            var post = await _postRepository.GetAsync(id);
            if (post == null)
            {
                result.IsFailed("文章不存在");
                return result;
            }

            var dto = ObjectMapper.Map<Post, PostDto>(post);

            result.IsSuccess(dto);
            return result;
        }
    }
}