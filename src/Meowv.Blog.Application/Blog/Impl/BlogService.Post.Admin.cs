using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// Create a post.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<BlogResponse> CreatePostAsync(CreatePostInput input)
        {
            var response = new BlogResponse();

            var category = await _categories.GetAsync(input.CategoryId.ToObjectId());
            var tags = await _tags.GetListAsync();

            var newTags = input.Tags.Where(item => !tags.Any(x => x.Name == item)).Select(x => new Tag
            {
                Name = x,
                Alias = x
            });
            if (newTags.Any())
            {
                await _tags.BulkInsertAsync(newTags);
            }

            return response;
        }
    }
}