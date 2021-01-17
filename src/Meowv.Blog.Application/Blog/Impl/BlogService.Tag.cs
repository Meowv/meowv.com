using Meowv.Blog.Dto.Blog;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// Get the list of tags.
        /// </summary>
        /// <returns></returns>
        [Route("api/meowv/blog/tags")]
        public async Task<BlogResponse<List<GetTagDto>>> GetTagsAsync()
        {
            return await _cache.GetTagsAsync(async () =>
            {
                var response = new BlogResponse<List<GetTagDto>>();

                var tags = await _tags.GetListAsync();

                var result = tags.Select(x => new GetTagDto
                {
                    Name = x.Name,
                    Alias = x.Alias,
                    Total = _posts.GetCountByTagAsync(x.Id).Result
                }).Where(x => x.Total > 0).ToList();

                response.Result = result;
                return response;
            });
        }
    }
}