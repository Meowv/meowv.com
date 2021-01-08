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

            var tags = await _tags.GetListAsync();
            var newTags = input.Tags.Where(item => !tags.Any(x => x.Name == item)).Select(x => new Tag
            {
                Name = x,
                Alias = x.ToLower()
            });
            if (newTags.Any())
            {
                await _tags.BulkInsertAsync(newTags);
            }

            var post = new Post
            {
                Title = input.Title,
                Author = input.Author,
                Url = input.Url.GeneratePostUrl(input.CreatedAt),
                Html = input.Html,
                Markdown = input.Markdown,
                Category = await _categories.GetAsync(input.CategoryId.ToObjectId()),
                Tags = await _tags.GetListAsync(input.Tags),
                CreatedAt = input.CreatedAt
            };
            await _posts.InsertAsync(post);

            return response;
        }

        /// <summary>
        /// Delete post by id.
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public async Task<BlogResponse> DeletePostAsync(string id)
        {
            var response = new BlogResponse();

            var post = await _posts.FindAsync(id.ToObjectId());
            if (post is null)
            {
                response.IsFailed($"The post id not exists.");
                return response;
            }

            await _posts.DeleteAsync(id.ToObjectId());

            return response;
        }

        /// <summary>
        /// Update post by id.
        /// </summary>
        /// <param name="id"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<BlogResponse> UpdatePostAsync(string id, UpdatePostInput input)
        {
            var response = new BlogResponse();

            var post = await _posts.FindAsync(id.ToObjectId());
            if (post is null)
            {
                response.IsFailed($"The post id not exists.");
                return response;
            }

            var tags = await _tags.GetListAsync();
            var newTags = input.Tags.Where(item => !tags.Any(x => x.Name == item)).Select(x => new Tag
            {
                Name = x,
                Alias = x.ToLower()
            });
            if (newTags.Any())
            {
                await _tags.BulkInsertAsync(newTags);
            }

            post.Title = input.Title;
            post.Author = input.Author;
            post.Url = input.Url.GeneratePostUrl(input.CreatedAt);
            post.Html = input.Html;
            post.Markdown = input.Markdown;
            post.Category = await _categories.GetAsync(input.CategoryId.ToObjectId());
            post.Tags = await _tags.GetListAsync(input.Tags);
            post.CreatedAt = input.CreatedAt;
            await _posts.UpdateAsync(post);

            return response;
        }
    }
}