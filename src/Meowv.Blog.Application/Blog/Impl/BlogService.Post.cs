using Meowv.Blog.Dto;
using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// Gets post list by paging.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<BlogResponse<PagedList<GetPostDto>>> GetPostsAsync(PagingInput input)
        {
            var response = new BlogResponse<PagedList<GetPostDto>>();

            var result = await _posts.GetPagedListAsync(input.Page, input.Limit);

            var total = result.Item1;
            var posts = result.Item2.Select(x => new PostBriefDto
            {
                Title = x.Title,
                Url = x.Url,
                Year = x.CreatedAt.Year,
                CreatedAt = x.CreatedAt.FormatTime()
            }).GroupBy(x => x.Year)
            .Select(x => new GetPostDto
            {
                Year = x.Key,
                Posts = x
            }).ToList();

            response.Result = new PagedList<GetPostDto>(total, posts);
            return response;
        }
    }
}