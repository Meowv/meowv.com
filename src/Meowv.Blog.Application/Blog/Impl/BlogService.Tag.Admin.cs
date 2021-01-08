using Meowv.Blog.Domain.Blog;
using Meowv.Blog.Dto.Blog.Params;
using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using System.Threading.Tasks;

namespace Meowv.Blog.Blog.Impl
{
    public partial class BlogService
    {
        /// <summary>
        /// Create a tag.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<BlogResponse> CreateTagAsync(CreateTagInput input)
        {
            var response = new BlogResponse();

            var tag = await _tags.FindAsync(x => x.Name == input.Name);
            if (tag is not null)
            {
                response.IsFailed($"The tag:{input.Name} already exists.");
                return response;
            }

            await _tags.InsertAsync(new Tag
            {
                Name = input.Name,
                Alias = input.Alias
            });

            return response;
        }

        /// <summary>
        /// Delete tag by id.
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public async Task<BlogResponse> DeleteTagAsync(string id)
        {
            var response = new BlogResponse();

            var tag = await _tags.FindAsync(id.ToObjectId());
            if (tag is null)
            {
                response.IsFailed($"The tag id not exists.");
                return response;
            }

            await _tags.DeleteAsync(id.ToObjectId());

            return response;
        }

        /// <summary>
        /// Update tag by id.
        /// </summary>
        /// <param name="id"></param>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<BlogResponse> UpdateTagAsync(string id, UpdateTagInput input)
        {
            var response = new BlogResponse();

            var tag = await _tags.FindAsync(id.ToObjectId());
            if (tag is null)
            {
                response.IsFailed($"The tag id not exists.");
                return response;
            }

            tag.Name = input.Name;
            tag.Alias = input.Alias;

            await _tags.UpdateAsync(tag);

            return response;
        }
    }
}