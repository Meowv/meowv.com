using Meowv.Blog.Domain.Sayings.Repositories;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;

namespace Meowv.Blog.Sayings.Impl
{
    public partial class SayingService : ServiceBase, ISayingService
    {
        private readonly ISayingRepository _sayings;

        public SayingService(ISayingRepository sayings)
        {
            _sayings = sayings;
        }

        /// <summary>
        /// Get a saying.
        /// </summary>
        /// <returns></returns>
        [Route("api/meowv/saying/random")]
        public async Task<BlogResponse<string>> GetRandomAsync()
        {
            var response = new BlogResponse<string>();

            var saying = await _sayings.GetRandomAsync();

            response.Result = saying.Content;
            return response;
        }
    }
}