using Meowv.Blog.Application.Contracts.Blog;
using Meowv.Blog.ToolKits.Base;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Application.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// 根据URL获取文章详情
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        public async Task<ServiceResult<PostDetailDto>> GetPostDetailAsync(string url)
        {
            var result = new ServiceResult<PostDetailDto>();

            var post = await _postRepository.FindAsync(x => x.Url.Equals(url));

            if (null == post)
            {
                result.Message = $"URL：{url} 不存在";
                return result;
            }

            var category = await _categoryRepository.GetAsync(post.CategoryId);

            var tags = (from post_tags in await _postTagRepository.GetListAsync()
                        join tag in await _tagRepository.GetListAsync()
                        on post_tags.TagId equals tag.Id
                        where post_tags.PostId.Equals(post.Id)
                        select new TagDto
                        {
                            TagName = tag.TagName,
                            DisplayName = tag.DisplayName
                        }).ToList();

            var previous = _postRepository.Where(x => x.CreationTime > post.CreationTime).Take(1).FirstOrDefault();
            var next = _postRepository.Where(x => x.CreationTime < post.CreationTime).OrderByDescending(x => x.CreationTime).Take(1).FirstOrDefault();

            var postDetail = new PostDetailDto
            {
                Title = post.Title,
                Author = post.Author,
                Url = post.Url,
                Html = post.Html,
                Markdown = post.Markdown,
                CreationTime = post.CreationTime.ToString("yyyy-MM-dd:HH:mm:ss"),
                Category = new CategoryDto
                {
                    CategoryName = category.CategoryName,
                    DisplayName = category.DisplayName
                },
                Tags = tags,
                Previous = previous == null ? null : new PostForPagedDto
                {
                    Title = previous.Title,
                    Url = previous.Url
                },
                Next = next == null ? null : new PostForPagedDto
                {
                    Title = next.Title,
                    Url = next.Url
                }
            };

            result.Data = postDetail;
            return result;
        }
    }
}