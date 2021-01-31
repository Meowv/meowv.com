using Meowv.Blog.Domain.Sayings;
using Meowv.Blog.Dto.Sayings;
using Meowv.Blog.Dto.Sayings.Params;
using Meowv.Blog.Extensions;
using Meowv.Blog.Response;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
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
        [Authorize]
        [Route("api/meowv/saying")]
        public async Task<BlogResponse> CreateAsync(CreateInput input)
        {
            var response = new BlogResponse();
            if (!input.Content.Any())
            {
                response.IsFailed("The content list is null.");
                return response;
            }
            await _sayings.InsertManyAsync(input.Content.Select(x => new Saying { Content = x.Trim() }));

            return response;
        }

        /// <summary>
        /// Delete saying by id.
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/saying/{id}")]
        public async Task<BlogResponse> DeleteAsync(string id)
        {
            var response = new BlogResponse();

            var saying = await _sayings.FindAsync(id.ToObjectId());
            if (saying is null)
            {
                response.IsFailed($"The saying id not exists.");
                return response;
            }

            await _sayings.DeleteAsync(id.ToObjectId());

            return response;
        }

        /// <summary>
        /// Get the list of sayings by paging.
        /// </summary>
        /// <param name="page"></param>
        /// <param name="limit"></param>
        /// <returns></returns>
        [Authorize]
        [Route("api/meowv/sayings/{page}/{limit}")]
        public async Task<BlogResponse<PagedList<SayingDto>>> GetSayingsAsync(int page, int limit)
        {
            var response = new BlogResponse<PagedList<SayingDto>>();

            var result = await _sayings.GetPagedListAsync(page, limit);
            var total = result.Item1;
            var sayings = ObjectMapper.Map<List<Saying>, List<SayingDto>>(result.Item2);

            response.Result = new PagedList<SayingDto>(total, sayings);
            return response;
        }
    }
}