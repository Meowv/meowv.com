using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.Domain.Blog;
using Meowv.Blog.ToolKits.Base;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// 获取文章详细信息
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public async Task<ServiceResult<GetPostForAdminDto>> GetPostForAdminAsync(int id)
        {
            var result = new ServiceResult<GetPostForAdminDto>();

            var post = await _postRepository.GetAsync(id);

            var tags = from post_tags in await _postTagRepository.GetListAsync()
                       join tag in await _tagRepository.GetListAsync()
                       on post_tags.TagId equals tag.Id
                       where post_tags.PostId.Equals(post.Id)
                       select tag.TagName;

            var detail = ObjectMapper.Map<Post, GetPostForAdminDto>(post);
            detail.Tags = tags;
            detail.Url = post.Url.Split("/").Where(x => !string.IsNullOrEmpty(x)).Last();

            result.IsSuccess(detail);
            return result;
        }
    }
}