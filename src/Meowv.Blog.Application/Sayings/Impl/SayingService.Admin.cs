using Meowv.Blog.Domain.Sayings;
using Meowv.Blog.Dto.Sayings.Params;
using Meowv.Blog.Response;
using System.Linq;
using System.Threading.Tasks;

namespace Meowv.Blog.Sayings.Impl
{
    public partial class SayingService
    {
        /// <summary>
        /// Create sayings.
        /// </summary>
        /// <param name="input"></param>
        /// <returns></returns>
        public async Task<BlogResponse> CreateAsync(CreateInput input)
        {
            var response = new BlogResponse();
            if (!input.Content.Any())
            {
                response.IsFailed("The content list is null.");
                return response;
            }
            await _sayings.BulkInsertAsync(input.Content.Select(x => new Saying { Content = x.Trim() }));
            return response;
        }
    }
}